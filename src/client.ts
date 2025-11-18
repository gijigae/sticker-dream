// Get DOM elements
const recordBtn = document.querySelector(".record") as HTMLButtonElement;
const transcriptDiv = document.querySelector(".transcript") as HTMLDivElement;
const audioElement = document.querySelector("#audio") as HTMLAudioElement;
const imageDisplay = document.querySelector(
  ".image-display"
) as HTMLImageElement;

let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let recordingTimeout: number | null = null;

// Check for microphone access before showing the button
async function checkMicrophoneAccess() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop the stream immediately, we just needed to check permission
    stream.getTracks().forEach((track) => track.stop());

    // Show the record button
    recordBtn.style.display = "block";
    transcriptDiv.textContent = "Press the button and imagine a sticker!";
  } catch (error) {
    console.error("Microphone access denied:", error);
    transcriptDiv.textContent =
      "❌ Microphone access required. Please enable microphone permissions in your browser settings.";
    recordBtn.style.display = "none";
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resetRecorder() {
  audioChunks = [];
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (event) => {
    console.log(`Data available`, event);
    audioChunks.push(event.data);
  };

  mediaRecorder.onstop = async () => {
    console.log(`Media recorder stopped`);
    // Remove recording class
    recordBtn.classList.remove("recording");
    recordBtn.classList.add("loading");
    recordBtn.textContent = "Transcribing...";

    // Create audio blob
    const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
    const audioUrl = URL.createObjectURL(audioBlob);
    audioElement.src = audioUrl;

    try {
      // Transcribe using OpenAI API
      transcriptDiv.textContent = "Transcribing...";
      console.log(`🎤 Sending audio to server for transcription...`);
      
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const transcribeResponse = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!transcribeResponse.ok) {
        throw new Error(`Transcription failed: ${transcribeResponse.statusText}`);
      }

      const { text } = await transcribeResponse.json();
      transcriptDiv.textContent = text;
      console.log(`✅ Transcription: "${text}"`);

      recordBtn.textContent = "Dreaming Up...";

      const abortWords = ["BLANK", "NO IMAGE", "NO STICKER", "CANCEL", "ABORT", "START OVER"];
      if(!text || abortWords.some(word => text.toUpperCase().includes(word))) {
        transcriptDiv.textContent = "No image generated.";
        recordBtn.classList.remove("loading");
        recordBtn.textContent = "Cancelled";
        setTimeout(() => {
          recordBtn.textContent = "Sticker Dream";
        }, 1000);
        resetRecorder();
        return;
      }

      // Actually generate and print the image!
      try {
        await generateAndPrint(text);
        
        // Stop loading state
        recordBtn.classList.remove("loading");
        recordBtn.textContent = "Printed!";
        setTimeout(() => {
          recordBtn.textContent = "Sticker Dream";
        }, 1000);
      } catch (error) {
        console.error("Failed to generate and print:", error);
        recordBtn.classList.remove("loading");
        recordBtn.textContent = "Error!";
        setTimeout(() => {
          recordBtn.textContent = "Sticker Dream";
        }, 2000);
      }
    } catch (error) {
      console.error("Transcription error:", error);
      transcriptDiv.textContent = "❌ Transcription failed";
      recordBtn.classList.remove("loading");
      recordBtn.textContent = "Error!";
      setTimeout(() => {
        recordBtn.textContent = "Sticker Dream";
      }, 2000);
    }
    
    resetRecorder();

  };
}

// Check microphone access on load
checkMicrophoneAccess();
resetRecorder();

// Start recording when button is pressed down
recordBtn.addEventListener("pointerdown", async () => {
  // Reset audio chunks
  audioChunks = [];
  console.log(`Media recorder`, mediaRecorder);
  // Start recording
  mediaRecorder.start();
  console.log(`Media recorder started`);
  recordBtn.classList.add("recording");
  recordBtn.textContent = "Listening...";

  // Auto-stop after 5 seconds
  recordingTimeout = window.setTimeout(() => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    }
  }, 15000);
});

// Stop recording when button is released
recordBtn.addEventListener("pointerup", () => {
  console.log(`Media recorder pointerup`);
  if (recordingTimeout) {
    clearTimeout(recordingTimeout);
    recordingTimeout = null;
  }

  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach((track) => track.stop());
  }
});

// Also stop if pointer leaves the button while held
recordBtn.addEventListener("pointerleave", () => {
  if (recordingTimeout) {
    clearTimeout(recordingTimeout);
    recordingTimeout = null;
  }

  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach((track) => track.stop());
  }
});

// Prevent context menu on long press
recordBtn.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

// Generate and print image from transcript
async function generateAndPrint(prompt: string) {
  if (!prompt || prompt === "Transcribing...") {
    console.error("No valid prompt to generate");
    return;
  }

  try {
    console.log(`🎨 Generating image for: "${prompt}"`);
    recordBtn.textContent = "Generating image...";
    transcriptDiv.textContent = `${prompt}\n\nGenerating image...`;

    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.statusText}`);
    }

    recordBtn.textContent = "Printing...";
    const blob = await response.blob();
    const imageUrl = URL.createObjectURL(blob);

    // Display the image
    imageDisplay.src = imageUrl;
    imageDisplay.style.display = "block";

    transcriptDiv.textContent = prompt;
    console.log("✅ Image generated and sent to printer!");
  } catch (error) {
    console.error("Error:", error);
    transcriptDiv.textContent = `${prompt}\n\nError: Failed to generate image`;
    throw error; // Re-throw so the calling code can handle it
  }
}
