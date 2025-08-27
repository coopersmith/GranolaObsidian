# Granola Notes Sync for Obsidian

This plugin syncs your [Granola](https://granola.ai) notes to your Obsidian vault.

## Features

- Imports Granola notes as Markdown files
- Preserves metadata in frontmatter (creation date, update date, note ID)
- Converts Granola's formatting to Markdown
- Simple one-click sync button

## Installation

### From Obsidian (Coming soon)

1. Open Settings in Obsidian
2. Go to Community Plugins and turn off Safe Mode
3. Click Browse and search for "Granola Notes Sync"
4. Install the plugin and enable it

### Manual Installation

1. Download the latest release
2. Extract the zip file into your Obsidian vault's `.obsidian/plugins/` folder
3. Reload Obsidian
4. Enable the plugin in the Community Plugins settings

## Setup

1. Find your Granola API token using one of these methods:

   > **Note:** Granola recently switched from Cognito to WorkOS for authentication. The old `cat ~/Library/Application Support/Granola/supabase.json` command shows a stale `cognito_tokens` entry. Use the following `jq` command to extract whichever token is currently valid.

   
   **Method 1: Using Terminal (new command)**
   ```bash
   FILE="$HOME/Library/Application Support/Granola/supabase.json"
   jq -r ' (try (.workos_tokens | fromjson | .access_token) // empty) as $w
     | (try (.cognito_tokens | fromjson | .access_token) // empty) as $c
     | if ($w|length)>0 then $w else $c end' "$FILE"
   ```
   This command prints your current Granola access token. It prefers the new `workos_tokens` entry and falls back to the older `cognito_tokens` value if needed.
   
   **Method 2: Using Developer Tools**
   - Open Granola app
   - Open developer tools (View → Developer → Toggle Developer Tools)
   - Go to Network tab
   - Look for requests to `api.granola.ai`
   - Find the Authorization header with format `Bearer <token>`
   - Copy the token part

   **Note about API token expiration:**
   Granola API tokens expire regularly (often within a day). If you see a 401 authentication error when syncing,
   run the command above again to obtain a fresh token and update it in your plugin settings.

2. In Obsidian, go to Settings → Granola Notes Sync
3. Paste your API token in the "API Token" field
4. Configure your desired output folder
5. (Optional) Configure a name mapping file to accurately display people's names

## Email-to-Name Mapping

The plugin attempts to extract people's names from their email addresses for better display in your notes. However, this is just a best-effort guess. For accurate name display:

1. Create a CSV file in your vault (for example, `email-names.csv`)
2. Format it with email addresses in the first column and full names in the second:
   ```
   email,name
   coopersmith@company.com,Cooper Smith
   john.doe@example.com,John Doe
   ```
3. In the plugin settings, set the "Name Map File Path" to the location of your CSV file
4. Click "Reload Map" to load the mappings

The plugin will then use these names when linking to people, displaying `[[Cooper Smith|coopersmith@example.com]]` instead of guessing the name.

## Usage

1. Click the sync icon in the left sidebar or run the "Sync Granola Notes" command
2. The plugin will fetch your Granola notes and save them as Markdown files in the specified folder

## Troubleshooting

### Authentication errors (401)
If you see errors like "Error fetching documents: Error: Request failed, status 401" or "Authentication failed" notifications:
1. Your Granola API token has likely expired
2. Generate a new token using the methods described in the Setup section
3. Update the token in Obsidian Settings → Granola Notes Sync
4. Try syncing again

## Requirements

- Granola desktop app must be installed on your computer
- You must have logged into Granola at least once

## Acknowledgements

This plugin was inspired by [Joseph Thacker's article](https://josephthacker.com/hacking/2025/05/08/reverse-engineering-granola-notes.html) on reverse engineering the Granola API.

## License

MIT 