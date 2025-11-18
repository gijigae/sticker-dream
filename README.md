# Sticker Dream

![](./dream.png)

A voice-activated sticker printer. Press and hold the button, describe what you want, and it generates a black and white coloring page sticker that prints to a thermal printer.

## How it works

1. Hold the button and speak (max 15 seconds)
2. Audio sent to OpenAI Whisper API for transcription
3. Google Imagen generates a coloring page based on your description
4. Image displays in browser and prints to your printer

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Create `.env` file:

```
OPENAI_API_KEY=your_openai_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
PRINTER_NAME=Canon_XK130_series_2
```

- **OPENAI_API_KEY**: Get from [OpenAI Platform](https://platform.openai.com/api-keys) - used for Whisper transcription
- **GEMINI_API_KEY**: Get from [Google AI Studio](https://aistudio.google.com/app/apikey) - used for image generation
- **PRINTER_NAME**: Should match your printer's name exactly as it appears in System Preferences (use underscores, not spaces!)

To see available printers, run the server and visit `http://localhost:3000/api/printers`.

3. Connect a printer. The app now supports:
   - Bluetooth printers (like your Canon XK130)
   - USB printers
   - Network printers (via Bonjour/AirPrint)
   - Any printer configured in macOS

## Running

Start the backend server:

```bash
# Option 1: Direct command (recommended, shows output)
./node_modules/.bin/tsx --env-file=.env --watch src/server.ts

# Option 2: Using pnpm (runs in background, no output)
pnpm server
```

Start the frontend (in another terminal):

```bash
pnpm dev
```

Open `http://localhost:7767`.

**Note**: Due to pnpm's output buffering, `pnpm server` doesn't show logs. Use the direct tsx command to see server logs in real-time.

To use your phone, you'll need to visit the page on your local network. Since it uses microphone access, this needs to be a secure origin. I use Cloudflare tunnels for this.

## Printers

TLDR: [The Phomemo](https://amzn.to/4hOmqki) PM2 will work great over bluetooth or USB.

While any printer will work, I'm using a 4x6 thermal printer with 4x6 shipping labels. These printers are fast, cheap and don't require ink.

Theoretically a bluetooth printer will work as well, but I have not tested. I'd love to get this working with these cheap Niimbot / Bluetooth "Cat printer", though those labels are plastic and not colour-able.

## Tips

The image prints right away, which is magical. Sometimes you can goof up. In this case, simply say "CANCEL", "ABORT" or "START OVER" as part of your recording.

## Ideas

It would be great if this was more portable. That app has 2 pieces: Client and Server. The TTS happens on the client. The Gemini API calls and printing happens on the server.

The server does not do anything computationally expensive - just API calls -, so it could theoretically be run on Raspberry PI or an ESP32, which may require re-writing in C++. The server also sends the data to the printer - so there would need to be drivers or use a lower level protocol use ESC/POS.

It could not be run 100% on an iphone browser as WebSerial / Web USB isn't supported on Safari. Perhaps it could as a react native app?
