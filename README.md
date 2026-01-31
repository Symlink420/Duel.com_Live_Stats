# Duel Live Stats Chrome Extension

A free Chrome extension that tracks live Plinko betting statistics on Duel.com. Real-time stats, persistent storage, and a clean UI. **by symlink**

## Features

- **Live Bet Tracking**: Monitors and captures bet requests from the Plinko game on Duel.com
- **Real-time Statistics**: Displays comprehensive betting statistics including:
  - Total bets placed
  - Total amount wagered
  - Total profit/loss
  - Average payout multiplier
  - Risk level breakdown (high, medium, low)
  - Recent bet history
- **Persistent Storage**: Maintains statistics across page reloads using Chrome storage
- **Modern UI**: Clean, responsive interface with dark theme and smooth animations
- **Draggable Window**: Stats window can be moved around the screen
- **Reset Functionality**: Clear all statistics with a single click

## Installation

### Method 1: Load as Unpacked Extension (Recommended for Development)

1. **Download the Extension Files**
   - Download all the extension files to a folder on your computer
   - Ensure you have the following files:
     - `manifest.json`
     - `content.js`
     - `background.js`
     - `styles.css`

2. **Open Chrome Extensions Page**
   - Open Google Chrome
   - Navigate to `chrome://extensions/`
   - Or go to Menu → More Tools → Extensions

3. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

4. **Load the Extension**
   - Click "Load unpacked"
   - Select the folder containing the extension files
   - The extension should now appear in your extensions list

5. **Pin the Extension (Optional)**
   - Click the puzzle piece icon in Chrome's toolbar
   - Find "Duel Live Stats" and click the pin icon

### Method 2: Create Extension Package

1. **Create a ZIP file** containing all the extension files
2. **Rename the ZIP file** to have a `.crx` extension (optional)
3. **Load the extension** using the same steps as Method 1

## Usage

### Getting Started

1. **Navigate to Duel.com Plinko**
   - Go to `https://duel.com/plinko`
   - The extension will automatically activate on this page

2. **Access the Stats Window**
   - Look for the circular stats icon in the bottom-right corner of the page
   - Click the icon to open the live stats window

3. **Start Playing**
   - Place bets in the Plinko game
   - The extension will automatically track and display statistics

### Using the Stats Window

- **Toggle**: Click the stats icon to open/close the window
- **Move**: Drag the window by its header to reposition it
- **Reset**: Click the "Reset" button to clear all statistics
- **Close**: Click the "×" button to close the window

### Understanding the Statistics

- **Total Bets**: Number of bets placed
- **Total Wagered**: Sum of all bet amounts
- **Total Profit**: Net profit/loss (green for profit, red for loss)
- **Total Winnings**: Total amount won from all bets
- **Avg Multiplier**: Average payout multiplier across all bets
- **Risk Level Breakdown**: Count of bets by risk level
- **Recent Bets**: Last 10 bets with details

## Technical Details

### Architecture

- **Manifest V3**: Uses the latest Chrome extension manifest format
- **Content Script**: Injects UI and intercepts network requests
- **Background Script**: Handles extension lifecycle and communication
- **Chrome Storage**: Persists data across sessions

### Permissions

- `webRequest`: Monitor network requests
- `storage`: Save statistics data
- `activeTab`: Access current tab information

### Browser Compatibility

- Chrome 88+ (Manifest V3 support required)
- Other Chromium-based browsers (Edge, Brave, etc.)

## Troubleshooting

### Extension Not Working

1. **Check URL**: Ensure you're on `https://duel.com/plinko` exactly
2. **Reload Page**: Refresh the page after installing the extension
3. **Check Console**: Open Developer Tools (F12) and check for errors
4. **Reinstall**: Remove and reinstall the extension

### Statistics Not Updating

1. **Check Network**: Ensure you have a stable internet connection
2. **Verify Game**: Make sure you're actually placing bets in the Plinko game
3. **Clear Cache**: Clear browser cache and reload the page
4. **Reset Stats**: Use the reset button to clear corrupted data

### UI Issues

1. **Zoom Level**: Check if browser zoom is set to 100%
2. **Screen Resolution**: The extension is optimized for standard screen sizes
3. **Browser Extensions**: Disable other extensions that might interfere

## Development

### File Structure

```
duel-live-stats/
├── manifest.json    # Extension config
├── content.js       # UI & bet tracking
├── background.js    # Service worker
├── styles.css       # UI styles
└── README.md
```

### Key Components

- **Content Script**: Handles DOM injection, fetch interception, and UI management
- **Background Script**: Manages extension state and communication
- **Storage**: Uses Chrome's local storage for data persistence
- **Fetch Interception**: Overrides the fetch API to capture bet responses

### Customization

You can modify the extension by editing the source files:

- **UI Changes**: Edit `styles.css` for visual modifications
- **Functionality**: Modify `content.js` for behavior changes
- **Configuration**: Update `manifest.json` for permissions and settings

## Privacy

- **Data Storage**: All data is stored locally on your device
- **No External Servers**: The extension doesn't send data to external servers
- **Local Only**: Statistics are only accessible to you

## Support

If you encounter issues or have questions:

1. Check this README for common solutions
2. Review the browser console for error messages
3. Ensure you're using a compatible browser version
4. Try reinstalling the extension

## License

Free to use and share. Credit **symlink** appreciated. Not affiliated with Duel.com; use at your own risk. For personal statistics only.

