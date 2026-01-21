# Granola Notes Sync for Obsidian

This plugin syncs your [Granola](https://granola.ai) notes to your Obsidian vault.

## Features

- Imports Granola notes as Markdown files
- Preserves metadata in frontmatter (creation date, update date, note ID)
- Converts Granola's formatting to Markdown
- Simple one-click sync button
- Automatic token refresh from Granola desktop app (macOS)

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

### macOS (Automatic)

On macOS, the plugin automatically reads your API token from the Granola desktop app. No manual configuration needed:

1. Make sure you're logged into the Granola desktop app
2. In Obsidian, go to Settings → Granola Notes Sync
3. Configure your desired output folder
4. (Optional) Configure a name mapping file to accurately display people's names

The plugin reads the token from `~/Library/Application Support/Granola/supabase.json`, which Granola keeps updated automatically. You'll never need to manually copy/paste tokens.

### Other Platforms (Manual)

If you're not on macOS, or if auto-read doesn't work, you can manually configure a token:

1. Disable "Auto-read token from Granola app" in plugin settings
2. Find your Granola API token using the terminal command:
   ```bash
   FILE="$HOME/Library/Application Support/Granola/supabase.json"
   jq -r ' (try (.workos_tokens | fromjson | .access_token) // empty) as $w
     | (try (.cognito_tokens | fromjson | .access_token) // empty) as $c
     | if ($w|length)>0 then $w else $c end' "$FILE"
   ```
3. Paste the token in the "API Token (fallback)" field in plugin settings

> **Note:** Manual tokens expire regularly (often within a day). If you see a 401 authentication error, you'll need to run the command again and update the token.

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
If you see "Authentication failed" notifications:

**With auto-read enabled (macOS):**
1. Make sure the Granola desktop app is installed and you're logged in
2. Try opening Granola and using it briefly to refresh the token
3. Check that the file exists: `~/Library/Application Support/Granola/supabase.json`

**With manual token:**
1. Your token has likely expired
2. Run the terminal command in the Setup section to get a fresh token
3. Update the token in plugin settings and try again

## Requirements

- Granola desktop app must be installed on your computer
- You must have logged into Granola at least once

## Acknowledgements

This plugin was inspired by [Joseph Thacker's article](https://josephthacker.com/hacking/2025/05/08/reverse-engineering-granola-notes.html) on reverse engineering the Granola API.

## License

MIT 