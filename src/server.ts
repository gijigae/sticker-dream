import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { GoogleGenAI } from "@google/genai";
import OpenAI from 'openai';
import { printToUSB, printImage, getAllPrinters, watchAndResumePrinters } from './print.ts';
import fs from 'fs';
import path from 'path';
import os from 'os';

const app = new Hono();
const PORT = 3000;

// Enable CORS for Vite dev server
app.use('/*', cors());

// Get printer name from environment or use default
const PRINTER_NAME = process.env["PRINTER_NAME"] || "Canon XK130 series 3";

console.log(`📋 Configured printer: "${PRINTER_NAME}"`);

// Start watching and resuming printers
// If a specific printer is configured, watch that one, otherwise watch all USB printers
console.log(`👀 Starting printer watcher for: ${PRINTER_NAME ? `"${PRINTER_NAME}"` : 'all USB/Bluetooth printers'}`);
watchAndResumePrinters({
  interval: 30000, // Check every 30 seconds instead of 1 second
  printerNames: PRINTER_NAME ? [PRINTER_NAME] : undefined,
  onResume: (printerName) => {
    console.log(`✅ Resumed printer: ${printerName}`);
  },
  onError: (error) => {
    console.warn(`⚠️ Printer watcher error:`, error.message);
  }
});

// Initialize Google AI
const ai = new GoogleGenAI({
  apiKey: process.env["GEMINI_API_KEY"],
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"],
});

/**
 * Generate an image using Imagen AI
 */

const imageGen4 = "imagen-4.0-generate-001";
const imageGen3 = "imagen-3.0-generate-002";
const imageGen4Fast = "imagen-4.0-fast-generate-001";
const imageGen4Ultra = "imagen-4.0-ultra-generate-001";

async function generateImage(prompt: string): Promise<Buffer | null> {
  console.log(`🎨 Generating image: "${prompt}"`);
  console.time('generation');

  const response = await ai.models.generateImages({
    model: imageGen4,
    prompt: `A black and white kids coloring page.
    <image-description>
    ${prompt}
    </image-description>
    ${prompt}`,
    config: {
      numberOfImages: 1,
      aspectRatio: "9:16"
    },
  });

  console.timeEnd('generation');

  if (!response.generatedImages || response.generatedImages.length === 0) {
    console.error('No images generated');
    return null;
  }

  const imgBytes = response.generatedImages[0].image?.imageBytes;
  if (!imgBytes) {
    console.error('No image bytes returned');
    return null;
  }

  return Buffer.from(imgBytes, "base64");
}

/**
 * API endpoint to transcribe audio using OpenAI Whisper
 */
app.post('/api/transcribe', async (c) => {
  try {
    console.log(`\n🎤 ===== TRANSCRIPTION REQUEST =====`);
    
    const body = await c.req.parseBody();
    const audioFile = body['audio'];
    
    if (!audioFile || !(audioFile instanceof File)) {
      console.error(`❌ No audio file provided`);
      return c.json({ error: 'Audio file is required' }, 400);
    }

    console.log(`📄 Audio file received: ${audioFile.name}, size: ${audioFile.size} bytes, type: ${audioFile.type}`);

    // Convert File to buffer
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Create a temporary file for OpenAI API (it requires a file)
    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const tempFilePath = path.join(tempDir, `audio-${timestamp}.webm`);
    
    console.log(`💾 Writing audio to temp file: ${tempFilePath}`);
    fs.writeFileSync(tempFilePath, buffer);

    try {
      console.log(`🚀 Sending to OpenAI Whisper API...`);
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: "whisper-1",
      });

      console.log(`✅ Transcription complete: "${transcription.text}"`);
      console.log(`🎤 ===== TRANSCRIPTION COMPLETE =====\n`);

      return c.json({ text: transcription.text });
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFilePath);
        console.log(`🗑️ Cleaned up temp file`);
      } catch (err) {
        console.warn(`⚠️ Could not delete temp file: ${tempFilePath}`);
      }
    }
  } catch (error) {
    console.error(`\n❌ ===== TRANSCRIPTION FAILED =====`);
    console.error(`Error:`, error);
    console.error(`🎤 ===== TRANSCRIPTION FAILED =====\n`);
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * API endpoint to list available printers
 */
app.get('/api/printers', async (c) => {
  try {
    const printers = await getAllPrinters();
    return c.json({
      configured: PRINTER_NAME,
      available: printers.map(p => ({
        name: p.name,
        status: p.status,
        isDefault: p.isDefault,
        isUSB: p.isUSB,
        isBluetooth: p.isBluetooth,
        uri: p.uri
      }))
    });
  } catch (error) {
    console.error('Error getting printers:', error);
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * API endpoint to generate and print image
 */
app.post('/api/generate', async (c) => {
  const { prompt } = await c.req.json();

  if (!prompt) {
    return c.json({ error: 'Prompt is required' }, 400);
  }

  try {
    // Generate the image
    const buffer = await generateImage(prompt);

    if (!buffer) {
      return c.json({ error: 'Failed to generate image' }, 500);
    }

    // Print the image
    console.log(`\n🖨️ ===== STARTING PRINT JOB =====`);
    console.log(`📄 Image buffer size: ${buffer.length} bytes`);
    
    try {
      // Check if the specified printer is available
      console.log(`🔍 Looking for available printers...`);
      const printers = await getAllPrinters();
      console.log(`📋 Found ${printers.length} printer(s):`);
      printers.forEach(p => {
        console.log(`   - ${p.name} (${p.isUSB ? 'USB' : p.isBluetooth ? 'Bluetooth' : 'Network'}) - ${p.status} ${p.isDefault ? '⭐ DEFAULT' : ''}`);
      });
      
      const targetPrinter = printers.find(p => p.name === PRINTER_NAME);
      
      if (targetPrinter) {
        console.log(`\n✅ Found target printer: "${PRINTER_NAME}"`);
        console.log(`   Status: ${targetPrinter.status}`);
        console.log(`   URI: ${targetPrinter.uri}`);
        console.log(`   Type: ${targetPrinter.isUSB ? 'USB' : targetPrinter.isBluetooth ? 'Bluetooth' : 'Network'}`);
        
        console.log(`\n🚀 Sending print job to ${PRINTER_NAME}...`);
        const jobId = await printImage(PRINTER_NAME, buffer, {
          fitToPage: true,
          copies: 1
        });
        console.log(`✅ Print job ${jobId} submitted successfully!`);
        console.log(`🖨️ ===== PRINT JOB COMPLETE =====\n`);
      } else {
        // Fall back to USB printer if specified printer not found
        console.warn(`\n⚠️ Printer "${PRINTER_NAME}" not found in available printers`);
        console.log(`🔄 Attempting fallback to USB printer...`);
        const printResult = await printToUSB(buffer, {
          fitToPage: true,
          copies: 1
        });
        console.log(`✅ Print job submitted to ${printResult.printerName} (Job ID: ${printResult.jobId})`);
        console.log(`🖨️ ===== PRINT JOB COMPLETE =====\n`);
      }
    } catch (printError) {
      console.error('\n❌ ===== PRINTING FAILED =====');
      console.error(`Error type: ${printError instanceof Error ? printError.constructor.name : typeof printError}`);
      console.error(`Error message: ${printError instanceof Error ? printError.message : String(printError)}`);
      if (printError instanceof Error && printError.stack) {
        console.error(`Stack trace:\n${printError.stack}`);
      }
      console.error(`🖨️ ===== PRINT JOB FAILED =====\n`);
      // Continue even if printing fails - still return the image
    }

    // Send the image back to the client
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
      },
    });

  } catch (error) {
    console.error('Error:', error);
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Log initial printer check on startup
getAllPrinters().then(printers => {
  console.log(`\n📋 Initial printer check at startup:`);
  console.log(`   Found ${printers.length} printer(s):`);
  printers.forEach(p => {
    const type = p.isUSB ? 'USB' : p.isBluetooth ? 'Bluetooth' : 'Network';
    const isConfigured = p.name === PRINTER_NAME ? ' ✅ CONFIGURED' : '';
    console.log(`   - ${p.name} (${type}) - ${p.status}${p.isDefault ? ' ⭐ DEFAULT' : ''}${isConfigured}`);
  });
  console.log('');
}).catch(err => {
  console.error(`⚠️ Could not check printers at startup:`, err.message);
});

serve({
  fetch: app.fetch,
  port: PORT,
}, (info) => {
  console.log(`\n🚀 Server running at http://localhost:${info.port}`);
  console.log(`📝 API endpoints:`);
  console.log(`   POST http://localhost:${info.port}/api/transcribe - Transcribe audio (OpenAI Whisper)`);
  console.log(`   GET  http://localhost:${info.port}/api/printers - List available printers`);
  console.log(`   POST http://localhost:${info.port}/api/generate - Generate and print image`);
  console.log('');
});

