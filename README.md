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
   
   **Method 1: Using Terminal**
   ```
   cat ~/Library/Application\ Support/Granola/supabase.json
   ```
   Find the `cognito_tokens` JSON string, and extract the `access_token` value.
   
   **Method 2: Using Developer Tools**
   - Open Granola app
   - Open developer tools (View → Developer → Toggle Developer Tools)
   - Go to Network tab
   - Look for requests to `api.granola.ai`
   - Find the Authorization header with format `Bearer <token>`
   - Copy the token part

2. In Obsidian, go to Settings → Granola Notes Sync
3. Paste your API token in the "API Token" field
4. Configure your desired output folder

## Usage

1. Click the sync icon in the left sidebar or run the "Sync Granola Notes" command
2. The plugin will fetch your Granola notes and save them as Markdown files in the specified folder

## Requirements

- Granola desktop app must be installed on your computer
- You must have logged into Granola at least once

## Acknowledgements

This plugin was inspired by [Joseph Thacker's article](https://josephthacker.com/hacking/2025/05/08/reverse-engineering-granola-notes.html) on reverse engineering the Granola API.

## License

MIT 