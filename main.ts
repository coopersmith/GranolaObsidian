import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFolder, TFile, TAbstractFile, requestUrl } from 'obsidian';

interface GranolaPluginSettings {
	outputFolder: string;
	apiToken: string;
}

const DEFAULT_SETTINGS: GranolaPluginSettings = {
	outputFolder: 'Granola',
	apiToken: ''
}

export default class GranolaPlugin extends Plugin {
	settings: GranolaPluginSettings;

	async onload() {
		await this.loadSettings();

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
			const documents = await this.fetchGranolaDocuments(this.settings.apiToken);
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
		const data = {
			"limit": 100,
			"offset": 0,
			"include_last_viewed_panel": true
		};
		
		try {
			const response = await requestUrl({
				url: url,
				method: 'POST',
				headers: headers,
				body: JSON.stringify(data)
			});
			
			if (response.status !== 200) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			
			const result = response.json;
			return result.docs || [];
		} catch (error) {
			console.error('Error fetching documents:', error);
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
	
	async processDocument(doc: any): Promise<boolean> {
		try {
			const title = doc.title || "Untitled Granola Note";
			const docId = doc.id || "unknown_id";
			console.log(`Processing document: ${title} (ID: ${docId})`);
			
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
			const markdownContent = this.convertProseMirrorToMarkdown(contentToParse);
			
			// Format dates for Obsidian linking
			const createdAtDate = doc.created_at ? new Date(doc.created_at) : new Date();
			const updatedAtDate = doc.updated_at ? new Date(doc.updated_at) : new Date();
			
			// Format as [[yyyy-mm-dd]] followed by timestamp
			const formatDateForObsidian = (date: Date) => {
				const year = date.getFullYear();
				const month = String(date.getMonth() + 1).padStart(2, '0');
				const day = String(date.getDate()).padStart(2, '0');
				return `[[${year}-${month}-${day}]] ${date.toISOString()}`;
			};
			
			// Add frontmatter
			const frontmatter = 
`---
granola_id: ${docId}
title: "${title.replace(/"/g, '\\"')}"
created_at: ${formatDateForObsidian(createdAtDate)}
updated_at: ${formatDateForObsidian(updatedAtDate)}
---

`;
			
			const finalMarkdown = frontmatter + markdownContent;
			
			// Create filename
			const filename = this.sanitizeFilename(title) + ".md";
			const filepath = `${this.settings.outputFolder}/${filename}`;
			
			// Write to file using Obsidian API
			const existingFile = this.app.vault.getAbstractFileByPath(filepath);
			if (existingFile instanceof TFile) {
				await this.app.vault.modify(existingFile, finalMarkdown);
			} else {
				await this.app.vault.create(filepath, finalMarkdown);
			}
			
			console.log(`Successfully saved: ${filepath}`);
			return true;
		} catch (error) {
			console.error(`Error processing document '${doc.title || "Untitled"}':`, error);
			return false;
		}
	}
	
	convertProseMirrorToMarkdown(content: any): string {
		if (!content || !content.content) {
			return "";
		}
		
		const result: string[] = [];
		
		const processNode = (node: any): string => {
			if (!node) return "";
			
			const nodeType = node.type || '';
			const nodeContent = node.content || [];
			const text = node.text || '';
			
			switch (nodeType) {
				case 'heading':
					const level = node.attrs?.level || 1;
					const headingText = nodeContent.map(processNode).join('');
					return `${'#'.repeat(level)} ${headingText}\n\n`;
					
				case 'paragraph':
					const paraText = nodeContent.map(processNode).join('');
					return `${paraText}\n\n`;
					
				case 'bulletList':
					return nodeContent.map((item: any) => {
						if (item.type === 'listItem') {
							const itemContent = (item.content || []).map(processNode).join('');
							return `- ${itemContent.trim()}`;
						}
						return '';
					}).filter(Boolean).join('\n') + '\n\n';
					
				case 'text':
					return text;
					
				default:
					return nodeContent.map(processNode).join('');
			}
		};
		
		content.content.forEach((node: any) => {
			result.push(processNode(node));
		});
		
		return result.join('');
	}
	
	sanitizeFilename(title: string): string {
		// Remove invalid characters
		const invalidChars = '<>:"/\\|?*';
		let filename = '';
		for (const char of title) {
			if (!invalidChars.includes(char)) {
				filename += char;
			}
		}
		// Replace spaces with underscores
		return filename.replace(/ /g, '_');
	}
}

class GranolaSettingTab extends PluginSettingTab {
	plugin: GranolaPlugin;

	constructor(app: App, plugin: GranolaPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Granola Notes Sync Settings'});

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
				
		containerEl.createEl('h3', {text: 'How to find your API token'});
		
		const instructions = containerEl.createEl('div');
		instructions.innerHTML = `
			<p>To find your Granola API token:</p>
			<ol>
				<li>Open terminal and run: <code>cat ~/Library/Application\\ Support/Granola/supabase.json</code></li>
				<li>Find the JSON string in <code>cognito_tokens</code></li>
				<li>Copy the <code>access_token</code> value</li>
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
		`;
	}
} 