import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFolder, TFile, TAbstractFile, requestUrl } from 'obsidian';

interface GranolaPluginSettings {
	outputFolder: string;
	apiToken: string;
	companyName: string;
	usePipeAliases: boolean;
	nameMapFilePath: string;
	linkableTopics: string;
}

const DEFAULT_SETTINGS: GranolaPluginSettings = {
	outputFolder: 'Granola',
	apiToken: '',
	companyName: '',
	usePipeAliases: true,
	nameMapFilePath: '',
	linkableTopics: ''
}

export default class GranolaPlugin extends Plugin {
	settings: GranolaPluginSettings;
	nameMap: Map<string, string> = new Map(); // Email to name mapping

	async onload() {
		await this.loadSettings();
		
		// Load name database if configured
		await this.loadNameMap();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new GranolaSettingTab(this.app, this));

		// This adds an icon to the left ribbon.
		this.addRibbonIcon('refresh-cw', 'Sync Granola Notes', () => {
			this.syncGranolaNotes();
		});

		// This adds a command that can be triggered anywhere
		this.addCommand({
			id: 'sync-granola-notes',
			name: 'Sync Granola Notes',
			callback: () => {
				this.syncGranolaNotes();
			}
		});
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async syncGranolaNotes() {
		try {
			// Show a notification that sync is starting
			new Notice('Starting Granola notes sync...');
			
			// Check if token is available
			if (!this.settings.apiToken) {
				new Notice('No API token found. Please set your Granola API token in settings.');
				return;
			}
			
			// Fetch the documents
			let documents;
			try {
				documents = await this.fetchGranolaDocuments(this.settings.apiToken);
			} catch (error) {
				// If this is an authentication error, show a notice but don't show the generic error
				if (error.message && error.message.includes('Authentication failed')) {
					return; // Already showed a notice in fetchGranolaDocuments
				}
				throw error; // Re-throw other errors to be caught by the outer catch
			}
			
			if (!documents || documents.length === 0) {
				new Notice('No Granola notes found or error fetching notes.');
				return;
			}
			
			// Ensure the output folder exists
			await this.ensureOutputFolderExists();
			
			// Process each document
			let successCount = 0;
			for (const doc of documents) {
				const result = await this.processDocument(doc);
				if (result) successCount++;
			}
			
			new Notice(`Sync complete! ${successCount} notes synced to ${this.settings.outputFolder} folder.`);
		} catch (error) {
			console.error('Error syncing Granola notes:', error);
			new Notice('Error syncing Granola notes. Check console for details.');
		}
	}
	
	async fetchGranolaDocuments(token: string): Promise<any[]> {
		const url = "https://api.granola.ai/v2/get-documents";
		const headers = {
			"Authorization": `Bearer ${token}`,
			"Content-Type": "application/json",
			"Accept": "*/*",
			"User-Agent": "Granola/5.354.0",
			"X-Client-Version": "5.354.0"
		};
		
		// Create a date for 7 days ago to get recent documents
		const sevenDaysAgo = new Date();
		sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
		
		// Log the sync parameters
		console.log(`Syncing documents since: ${sevenDaysAgo.toISOString()}`);
		
		// Request parameters
		const data = {
			"limit": 200, // Increased from 100 to get more documents
			"offset": 0,
			"include_last_viewed_panel": true,
			// Add a sort parameter to get newest first
			"sort": {
				"field": "created_at",
				"order": "desc"
			}
		};
		
		try {
			// First request - get everything
			console.log("Fetching documents from Granola API...");
			const response = await requestUrl({
				url: url,
				method: 'POST',
				headers: headers,
				body: JSON.stringify(data)
			});
			
			if (response.status !== 200) {
				if (response.status === 401) {
					throw new Error(`Authentication failed: Your Granola API token has expired (status: 401)`);
				} else {
					throw new Error(`HTTP error! status: ${response.status}`);
				}
			}
			
			const result = response.json;
			const docs = result.docs || [];
			
			console.log(`Retrieved ${docs.length} documents from Granola API`);
			
			// Debug: Log the first few documents' titles and created dates
			if (docs.length > 0) {
				console.log("Sample of documents retrieved:");
				docs.slice(0, 5).forEach((doc: any) => {
					console.log(`- Title: ${doc.title}, Created: ${doc.created_at}`);
				});
			}
			
			return docs;
		} catch (error) {
			console.error('Error fetching documents:', error);
			
			// Check if this is an authentication error (401)
			if (error.message && (
				error.message.includes('status 401') || 
				error.message.includes('Authentication failed') || 
				(error.status === 401) || 
				(error.response && error.response.status === 401)
			)) {
				// Show a more helpful message for authentication errors
				new Notice('Authentication failed: Your Granola API token is invalid or has expired. Please update it in settings.');
				
				// Throw a more specific error
				throw new Error('Authentication failed: Your Granola API token is invalid or has expired.');
			}
			
			// For other errors, return empty array
			return [];
		}
	}
	
	async ensureOutputFolderExists() {
		// Get the vault's root folder
		const folderPath = this.settings.outputFolder;
		
		// Check if the folder exists, create it if it doesn't
		const abstractFile = this.app.vault.getAbstractFileByPath(folderPath);
		if (!abstractFile) {
			await this.app.vault.createFolder(folderPath);
			console.log(`Created folder: ${folderPath}`);
		} else if (!(abstractFile instanceof TFolder)) {
			throw new Error(`${folderPath} exists but is not a folder`);
		}
	}
	
	// Helper function to extract attendees from an array
	extractAttendeesFromArray(attendeesArray: any[]): {email: string, role?: string}[] {
		if (!Array.isArray(attendeesArray)) {
			console.log("DEBUG - Expected array but got:", attendeesArray);
			return [];
		}
		
		return attendeesArray
			.filter((attendee: any) => {
				const isValid = attendee && 
					attendee.email && 
					typeof attendee.email === 'string' &&
					(!attendee.resource || attendee.resource === false);
				
				if (!isValid && attendee) {
					console.log("DEBUG - Filtering out attendee:", attendee);
				}
				return isValid;
			})
			.map((attendee: any) => {
				let role = '';
				if (attendee.organizer) role = 'organizer';
				else if (attendee.self) role = 'self';
				
				return {
					email: attendee.email,
					...(role ? { role } : {})
				};
			});
	}
	
	// Recursive function to find attendees property
	findAttendeesRecursive(obj: any, path: string = ''): {attendees: any[], path: string} | null {
		if (!obj || typeof obj !== 'object') return null;
		
		// Check if this object has an attendees property that's an array
		if (obj.attendees && Array.isArray(obj.attendees) && obj.attendees.length > 0) {
			return { attendees: obj.attendees, path: path ? `${path}.attendees` : 'attendees' };
		}
		
		// Don't search in known non-attendee properties to avoid excessive logging
		const skipProps = ['content', 'text', 'type', 'attrs'];
		
		// Recursively search in object properties
		for (const key of Object.keys(obj)) {
			if (skipProps.includes(key)) continue;
			
			const newPath = path ? `${path}.${key}` : key;
			const result = this.findAttendeesRecursive(obj[key], newPath);
			if (result) return result;
		}
		
		return null;
	}
	
	async processDocument(doc: any): Promise<boolean> {
		try {
			// Extract and format the creation date for title prefixing
			const createdAtDate = doc.created_at ? new Date(doc.created_at) : new Date();
			
                // Format date components for prefixing the title
			const year = createdAtDate.getFullYear();
			const month = String(createdAtDate.getMonth() + 1).padStart(2, '0');
			const day = String(createdAtDate.getDate()).padStart(2, '0');
			const datePrefix = `${year}-${month}-${day}`;
			
			// Update title to include date for uniqueness
			const originalTitle = doc.title || "Untitled Granola Note";
			const title = `${datePrefix} ${originalTitle}`;
			
			const docId = doc.id || "unknown_id";
			console.log(`Processing document: ${title} (ID: ${docId})`);
			
			// Log the full document structure to find attendees
			console.log("DEBUG - Document keys:", Object.keys(doc));
			if (doc.notes) console.log("DEBUG - doc.notes keys:", Object.keys(doc.notes));
			if (doc.meeting_metadata) console.log("DEBUG - doc.meeting_metadata keys:", Object.keys(doc.meeting_metadata));
			
			// Find content to parse
			let contentToParse = null;
			if (doc.last_viewed_panel && 
				doc.last_viewed_panel.content &&
				doc.last_viewed_panel.content.type === "doc") {
				contentToParse = doc.last_viewed_panel.content;
			}
			
			if (!contentToParse) {
				console.warn(`Skipping document '${title}' - no suitable content found`);
				return false;
			}
			
			// Convert to markdown
			let markdownContent = this.convertProseMirrorToMarkdown(contentToParse);
			
                // Format dates with local timezone offset (e.g., 2023-09-13T10:00:00-04:00)
                const formatDateWithOffset = (dateString: string | null) => {
                                const date = dateString ? new Date(dateString) : new Date();

                                // getTimezoneOffset returns minutes *behind* UTC. Positive for zones west of UTC.
                                const tzOffsetMinutes = date.getTimezoneOffset();

                                // Shift the date by the offset so toISOString returns local time components
                                const adjustedDate = new Date(date.getTime() - tzOffsetMinutes * 60000);
                                const iso = adjustedDate.toISOString().slice(0, -1); // remove trailing 'Z'

                                const sign = tzOffsetMinutes > 0 ? '-' : '+';
                                const pad = (num: number) => String(Math.abs(Math.floor(num))).padStart(2, '0');
                                const hours = pad(tzOffsetMinutes / 60);
                                const minutes = pad(tzOffsetMinutes % 60);

                                return `${iso}${sign}${hours}:${minutes}`;
                        };
			
			// Extract attendees with deep inspection
			let attendees: {email: string, role?: string}[] = [];
			
			// Look in various possible locations for attendees
			if (doc.attendees && Array.isArray(doc.attendees)) {
				console.log("DEBUG - Found attendees in doc.attendees");
				attendees = this.extractAttendeesFromArray(doc.attendees);
			} else if (doc.meeting_metadata && doc.meeting_metadata.attendees) {
				console.log("DEBUG - Found attendees in doc.meeting_metadata.attendees");
				attendees = this.extractAttendeesFromArray(doc.meeting_metadata.attendees);
			} else if (doc.notes && doc.notes.meeting_metadata && doc.notes.meeting_metadata.attendees) {
				console.log("DEBUG - Found attendees in doc.notes.meeting_metadata.attendees");
				attendees = this.extractAttendeesFromArray(doc.notes.meeting_metadata.attendees);
			} else if (doc.metadata && doc.metadata.attendees) {
				console.log("DEBUG - Found attendees in doc.metadata.attendees");
				attendees = this.extractAttendeesFromArray(doc.metadata.attendees);
			} else {
				// Try to find attendees in any object property
				console.log("DEBUG - Searching document for attendees property");
				const foundAttendees = this.findAttendeesRecursive(doc);
				if (foundAttendees) {
					console.log("DEBUG - Found attendees in nested property:", foundAttendees.path);
					attendees = this.extractAttendeesFromArray(foundAttendees.attendees);
				}
			}
			
			console.log("DEBUG - Final attendees array:", attendees);
			
			// Apply backlinks for person mentions and topics
			markdownContent = this.addPersonBacklinks(markdownContent, attendees);
			markdownContent = this.addTopicBacklinks(markdownContent);
			
			// Build frontmatter in the requested order with new properties
			let frontmatter = 
`---
title: "${title.replace(/"/g, '\\"')}"
categories: "[[Meetings]]"
type: 
created_at: ${formatDateWithOffset(doc.created_at)}
`;

			// Add organization if set
			if (this.settings.companyName) {
				frontmatter += `org: "[[${this.settings.companyName}]]"\n`;
			} else {
				frontmatter += `org: \n`;
			}

			// Add people (renamed from attendees)
			if (attendees.length > 0) {
				// Format as a simple YAML string array
				frontmatter += `people: [`;
				
				// Join emails with commas, use email addresses directly
				const emailList = attendees.map(attendee => {
					const email = attendee.email;
					// Convert email to a display name for better readability
					const displayName = this.extractNameFromEmail(email);
					
					// Format the link based on the settings
					if (this.settings.usePipeAliases) {
						// Format as "[[Personname|email@example.com]]" to handle aliases correctly
						return `"[[${displayName}|${email}]]"`;
					} else {
						// Just use the email address as direct link
						return `"[[${email}]]"`;
					}
				}).join(", ");
				
				frontmatter += `${emailList}]\n`;
			} else {
				frontmatter += `people: \n`;
			}

			// Add empty topics field
			frontmatter += `topics: \n`;

			// Add tags field
			frontmatter += `tags: meetings\n`;

			// Add granola_id at the end (moved from beginning)
			frontmatter += `granola_id: ${docId}\n`;

			// Close frontmatter
			frontmatter += `---\n\n`;
			
			const finalMarkdown = frontmatter + markdownContent;
			
			// Create filename with the date prefix for uniqueness, keeping spaces instead of underscores
			const filename = this.sanitizeFilename(`${title}.md`);
			const filepath = `${this.settings.outputFolder}/${filename}`

			// Save the file
			await this.app.vault.create(filepath, finalMarkdown);
			console.log(`Saved document: ${filepath}`);

			return true;
		} catch (error) {
			console.error('Error processing document:', error);
			return false;
		}
	}
	
	convertProseMirrorToMarkdown(content: any): string {
		if (!content || !content.content) {
			return '';
		}
		
		const result: string[] = [];
		
		const processNode = (node: any, indent = 0): string => {
			if (!node) return '';

			const nodeType = node.type || '';
			const nodeContent = node.content || [];
			const text = node.text || '';

			switch (nodeType) {
				case 'heading':
					const level = node.attrs?.level || 1;
					const headingText = nodeContent.map((n: any) => processNode(n, indent)).join('');
					return `${'#'.repeat(level)} ${headingText}\n\n`;

				case 'paragraph':
					const paraText = nodeContent.map((n: any) => processNode(n, indent)).join('');
					return `${paraText}\n\n`;

				case 'bulletList':
					return nodeContent
						.map((item: any) => {
							if (item.type === 'listItem') {
								const parts = (item.content || []).map((n: any) => processNode(n, indent + 1));
								const first = (parts.shift() || '').trim();
								const rest = parts.join('').trimEnd();
								const nested = rest ? `\n${rest}` : '';
								return `${'  '.repeat(indent)}- ${first}${nested}`;
							}
							return '';
						})
						.filter(Boolean)
						.join('\n') + '\n\n';

				case 'text':
					return text;

				default:
					return nodeContent.map((n: any) => processNode(n, indent)).join('');
			}
		};
		
		content.content.forEach((node: any) => {
			result.push(processNode(node));
		});
		
		return result.join('');
	}
	
	sanitizeFilename(title: string): string {
		// Include all invalid characters including forward slash
		const invalidChars = '<>:"/\\|?*';
		let filename = "";
		
		// Replace each invalid character with an appropriate substitute
		for (const char of title) {
			if (!invalidChars.includes(char)) {
				filename += char;
			} else if (char === '/') {
				// Replace forward slashes with a hyphen or another safe character
				filename += '-';
			}
			// Simply skip other invalid characters
		}
		
		return filename;
	}
	
	// Load the CSV name mapping file if it exists
	async loadNameMap() {
		if (!this.settings.nameMapFilePath) return;
		
		try {
			// Get the file from the vault
			const file = this.app.vault.getAbstractFileByPath(this.settings.nameMapFilePath);
			
			if (file instanceof TFile) {
				// Read and parse the CSV content
				const content = await this.app.vault.read(file);
				const lines = content.split('\n');
				
				// Clear existing map
				this.nameMap.clear();
				
				// Skip header line if present
				const startLine = lines[0].toLowerCase().includes('email') ? 1 : 0;
				
				// Parse each line as email,name
				for (let i = startLine; i < lines.length; i++) {
					const line = lines[i];
					if (!line.trim()) continue;
					
					// Split by comma, but handle cases with commas in names
					const match = line.match(/^([^,]+),(.+)$/);
					if (match) {
						const [_, email, name] = match;
						// Make sure to trim any whitespace from both email and name
						this.nameMap.set(email.trim().toLowerCase(), name.trim());
					}
				}
				
				console.log(`Loaded ${this.nameMap.size} name mappings from ${this.settings.nameMapFilePath}`);
			}
		} catch (error) {
			console.error('Error loading name mapping file:', error);
			new Notice(`Failed to load name mapping file: ${error.message}`);
		}
	}
	
	// Update the extractNameFromEmail function to first check the database
	extractNameFromEmail(email: string): string {
		if (!email || !email.includes('@')) return email;
		
		// First check our mapping database
		const lowercaseEmail = email.toLowerCase();
		const mappedName = this.nameMap.get(lowercaseEmail);
		if (mappedName) return mappedName;
		
		// Fall back to extracting from email
		const username = email.split('@')[0];
		
		// Handle common name formats in emails
		if (username.includes('.')) {
			// Format: first.last@domain.com
			return username.split('.').map(namePart => this.capitalizeFirstLetter(namePart)).join(' ');
		}
		
		if (/[A-Z]/.test(username) && username.toLowerCase() !== username) {
			// Format: FirstLast@domain.com or firstLast@domain.com
			const nameParts = username.split(/(?=[A-Z])/).map(namePart => this.capitalizeFirstLetter(namePart));
			return nameParts.join(' ');
		}
		
		if (username.includes('_')) {
			// Format: first_last@domain.com
			return username.split('_').map(namePart => this.capitalizeFirstLetter(namePart)).join(' ');
		}
		
		if (username.includes('-')) {
			// Format: first-last@domain.com
			return username.split('-').map(namePart => this.capitalizeFirstLetter(namePart)).join(' ');
		}
		
		// For usernames with no separator but of reasonable length, try to split into first/last name
		if (username.length > 5) {
			// Simple heuristic - split at 60% point for first name
			const splitPoint = Math.floor(username.length * 0.6);
			const firstName = this.capitalizeFirstLetter(username.substring(0, splitPoint));
			const lastName = this.capitalizeFirstLetter(username.substring(splitPoint));
			return `${firstName} ${lastName}`;
		}
		
		// Default to just capitalizing the username
		return this.capitalizeFirstLetter(username);
	}
	
	// Helper to capitalize the first letter of a string
	capitalizeFirstLetter(str: string): string {
		if (!str || str.length === 0) return str;
		return str.charAt(0).toUpperCase() + str.slice(1);
	}
	
	// Add backlinks for person mentions in content
	addPersonBacklinks(content: string, attendees: {email: string, role?: string}[]): string {
		if (!attendees || attendees.length === 0) return content;
		
		let modifiedContent = content;
		
		// For each attendee, get their display name and add backlinks
		for (const attendee of attendees) {
			const displayName = this.extractNameFromEmail(attendee.email);
			
			// Skip if the name is just an email or too short
			if (!displayName || displayName.includes('@') || displayName.length < 3) continue;
			
			// Create a regex pattern that matches the name with word boundaries
			// Use negative lookbehind and lookahead to avoid matching inside existing [[...]]
			// Escape special regex characters
			const escapedName = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			
			// This pattern ensures we don't match text that's already inside [[ ]]
			// Using negative lookbehind (?<!\[\[) would be ideal but isn't supported in all environments
			// So we'll do a simpler approach: just avoid strings that already have [[ before them
			const pattern = new RegExp(`(?<!\\[\\[)\\b(${escapedName})\\b(?!\\]\\])`, 'g');
			
			// Replace with backlink
			modifiedContent = modifiedContent.replace(pattern, '[[$1]]');
		}
		
		return modifiedContent;
	}
	
	// Add backlinks for configured topics in content
	addTopicBacklinks(content: string): string {
		if (!this.settings.linkableTopics || this.settings.linkableTopics.trim() === '') {
			return content;
		}
		
		// Parse comma-separated topics
		const topics = this.settings.linkableTopics
			.split(',')
			.map(topic => topic.trim())
			.filter(topic => topic.length > 0);
		
		if (topics.length === 0) return content;
		
		let modifiedContent = content;
		
		// For each topic, add backlinks
		for (const topic of topics) {
			// Escape special regex characters
			const escapedTopic = topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			
			// Pattern that avoids matching inside existing [[ ]]
			const pattern = new RegExp(`(?<!\\[\\[)\\b(${escapedTopic})\\b(?!\\]\\])`, 'gi');
			
			// Replace with backlink, preserving the original case
			modifiedContent = modifiedContent.replace(pattern, '[[$1]]');
		}
		
		return modifiedContent;
	}
}

class GranolaSettingTab extends PluginSettingTab {
	plugin: GranolaPlugin;

	constructor(app: App, plugin: GranolaPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Granola Notes Sync Settings' });

		new Setting(containerEl)
			.setName('Output folder')
			.setDesc('The folder where Granola notes will be saved')
			.addText(text => text
				.setPlaceholder('Granola')
				.setValue(this.plugin.settings.outputFolder)
				.onChange(async (value) => {
					this.plugin.settings.outputFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('API Token')
			.setDesc('Your Granola API token (see below for how to find this)')
			.addText(text => text
				.setPlaceholder('Enter your Granola API token')
				.setValue(this.plugin.settings.apiToken)
				.onChange(async (value) => {
					this.plugin.settings.apiToken = value;
					await this.plugin.saveSettings();
				}));
				
		new Setting(containerEl)
			.setName('Company Name')
			.setDesc('Your company name (optional, will appear as org: [[Company]] in frontmatter)')
			.addText(text => text
				.setPlaceholder('Enter your company name')
				.setValue(this.plugin.settings.companyName)
				.onChange(async (value) => {
					this.plugin.settings.companyName = value;
					await this.plugin.saveSettings();
				}));
				
		new Setting(containerEl)
			.setName('Use Pipe Aliases')
			.setDesc('When enabled, links to people will have display names (e.g., [[Cooper Smith|coopersmith@example.com]]). When disabled, links will use the email directly ([[coopersmith@example.com]]).')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.usePipeAliases)
				.onChange(async (value) => {
					this.plugin.settings.usePipeAliases = value;
					await this.plugin.saveSettings();
				}));
				
		new Setting(containerEl)
			.setName('Name Map File Path')
			.setDesc('The path to a CSV file containing email-to-name mappings')
			.addText(text => text
				.setPlaceholder('Enter the path to the name map file')
				.setValue(this.plugin.settings.nameMapFilePath)
				.onChange(async (value) => {
					this.plugin.settings.nameMapFilePath = value;
					await this.plugin.saveSettings();
				}))
			.addButton(button => button
				.setButtonText('Reload Map')
				.onClick(async () => {
					await this.plugin.loadNameMap();
					new Notice(`Reloaded name map from ${this.plugin.settings.nameMapFilePath}`);
				}));
				
		// Add instructions for name map file
		containerEl.createEl('div', { cls: 'setting-item-description', text: 'The name map file should be a CSV with email addresses in the first column and the full name in the second column. For example:' });
		const csvExample = containerEl.createEl('pre', { cls: 'setting-item-description' });
		csvExample.setText('coopersmith@example.com,Cooper Smith\njanesmith@example.com,Jane Smith');

		new Setting(containerEl)
			.setName('Linkable Topics')
			.setDesc('Comma-separated list of topics to automatically link in notes (e.g., "Product Strategy, Team Sync, Q4 Planning")')
			.addTextArea(text => text
				.setPlaceholder('Enter topics separated by commas')
				.setValue(this.plugin.settings.linkableTopics)
				.onChange(async (value) => {
					this.plugin.settings.linkableTopics = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h3', { text: 'How to find your API token' });
		const instructions = containerEl.createEl('div');
                instructions.innerHTML = `
                        <p>To find your Granola API token:</p>
                        <ol>
                                <li>Run the following in your terminal to print your current token:</li>
                                <pre><code>FILE="$HOME/Library/Application Support/Granola/supabase.json"
jq -r ' (try (.workos_tokens | fromjson | .access_token) // empty) as $w
  | (try (.cognito_tokens | fromjson | .access_token) // empty) as $c
  | if ($w|length)>0 then $w else $c end' "$FILE"</code></pre>
                                <li>Copy the printed token</li>
                        </ol>
                        <p>Or, if you have developer tools:</p>
                        <ol>
                                <li>Open Granola app</li>
                                <li>Open developer tools (View → Developer → Toggle Developer Tools)</li>
                                <li>Go to Network tab</li>
                                <li>Look for requests to <code>api.granola.ai</code></li>
                                <li>Find the Authorization header with format <code>Bearer &lt;token&gt;</code></li>
                                <li>Copy the token part</li>
                        </ol>
                        <p><strong>Important:</strong> Granola API tokens expire regularly. If you see a 401 authentication error, run the command above again to obtain a fresh token.</p>
                `;
	}
}