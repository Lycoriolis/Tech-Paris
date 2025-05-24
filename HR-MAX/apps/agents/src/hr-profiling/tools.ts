import { Runnable } from "@langchain/core/runnables";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";

const execAsync = promisify(exec);

export class LinkedInScraper extends Runnable<string, any> {
  lc_namespace = ["hr-profiling", "LinkedInScraper"];
  async invoke(_profileUrl: string) { // parameter is unused in mock
    // MOCKED: Return a static profile for testing instead of scraping LinkedIn
    return {
      name: "Mathieu Lemoing",
      headline: "Senior Software Engineer at ExampleCorp",
      location: "Paris, France",
      experience: [
        { company: "ExampleCorp", title: "Senior Software Engineer", years: 3 },
        { company: "OtherTech", title: "Software Engineer", years: 2 }
      ],
      education: [
        { school: "École Polytechnique", degree: "MSc Computer Science" }
      ],
      skills: ["TypeScript", "Node.js", "APIs", "React"]
    };
  }
}

export class CVOCRTool extends Runnable<Buffer, string> {
  lc_namespace = ["hr-profiling", "CVOCRTool"];

  async invoke(fileBuffer: Buffer): Promise<string> {
    let tempDir: string | null = null;
    let pdfPath: string | null = null;
    let pngPath: string | null = null;

    try {
      const openrouterApiKey = process.env.OPENROUTER_API_KEY;
      if (!openrouterApiKey) {
        throw new Error("OPENROUTER_API_KEY environment variable is not set. OCR functionality cannot work without it.");
      }

      // 1. Create temp directory and paths
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cv-ocr-"));
      const randomId = randomBytes(4).toString("hex");
      pdfPath = path.join(tempDir, `cv-${randomId}.pdf`);
      pngPath = path.join(tempDir, `cv-${randomId}.png`);

      // 2. Write buffer to temp PDF file
      console.log(`Writing PDF buffer to temp file: ${pdfPath}`);
      await fs.writeFile(pdfPath, fileBuffer);

      // 3. Convert PDF to PNG using ImageMagick
      console.log("Converting PDF to PNG using ImageMagick...");
      const convertCommand = `convert -density 300 "${pdfPath}"[0] -quality 100 "${pngPath}"`;
      console.log(`Running command: ${convertCommand}`);
      try {
        const { stdout: _stdout, stderr } = await execAsync(convertCommand);
        if (stderr) {
          console.warn("ImageMagick warning/info:", stderr);
        }
      } catch (execError) {
        const errorMsg = String(execError);
        if (errorMsg.includes("command not found") || errorMsg.includes("can't be found")) {
          throw new Error(
            "ImageMagick's 'convert' command was not found. Please ensure ImageMagick is correctly installed. " +
            "On Ubuntu/Debian, run: sudo apt-get update && sudo apt-get install imagemagick ghostscript"
          );
        }
        throw execError;
      }
      await fs.access(pngPath); // Check if PNG was created
      console.log(`Successfully created PNG at: ${pngPath}`);

      // 4. Read PNG image and convert to base64 data URL
      const imageBuffer = await fs.readFile(pngPath);
      const base64Image = imageBuffer.toString("base64");
      const imageUrl = `data:image/png;base64,${base64Image}`;

      const systemPrompt = "You are an expert at extracting information from CVs and resumes. Extract all the relevant text content from the provided CV image. Focus on skills, experience, education, and contact information. Present the extracted text clearly and comprehensively.";
      const userPrompt = "Extract all text content from this CV image.";

      console.log("Sending image to OpenRouter for CV OCR...");
      
      // 5. Make API call to OpenRouter vision model
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openrouterApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "opengvlab/internvl3-14b:free", // Or another suitable vision model
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: userPrompt },
                {
                  type: "image_url",
                  image_url: { url: imageUrl },
                },
              ],
            },
          ],
          max_tokens: 2500, // Adjust as needed
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenRouter API error for OCR: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const data = await response.json();

      if (data?.choices?.[0]?.message?.content) {
        console.log("Successfully extracted CV content via OpenRouter.");
        return data.choices[0].message.content;
      } else {
        let errorDetails = "response or choices array is null/empty";
        if (data && data.choices && data.choices.length > 0 && !data.choices[0].message) {
          errorDetails = "first choice message is null";
        } else if (data && data.choices && data.choices.length > 0 && data.choices[0].message && !data.choices[0].message.content) {
          errorDetails = "first choice message content is null/empty";
        }
        console.error(`OpenRouter OCR response missing content. Details: ${errorDetails}. Full response:`, JSON.stringify(data, null, 2));
        throw new Error(`Failed to extract CV information using OpenRouter. Details: ${errorDetails}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      throw new Error(`CVOCRTool failed: ${errorMessage}`);
    } finally {
      if (tempDir) {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
          console.log(`Cleaned up temporary directory: ${tempDir}`);
        } catch (cleanupError) {
          console.error(`Error cleaning up temporary directory ${tempDir}:`, cleanupError);
        }
      }
    }
  }
}

export class ATSParser extends Runnable<string, any> {
  lc_namespace = ["hr-profiling", "ATSParser"];
  async invoke(ocrText: string) {
    const emailMatch = ocrText.match(/[a-zA-Z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
    const skills = Array.from(ocrText.matchAll(/\b(JavaScript|TypeScript|Python|Java)\b/gi), m => m[0]);
    return { email: emailMatch?.[0] ?? null, skills: [...new Set(skills)] };
  }
}

export class JobSpecLoader extends Runnable<string, any> {
  lc_namespace = ["hr-profiling", "JobSpecLoader"];
  async invoke(jobId: string) {
    return {
      id: jobId,
      title: "Software Engineer",
      requirements: ["TypeScript", "Node.js", "APIs"],
    };
  }
}

export class OpenRouterChatWrapper extends Runnable<
  { system: string; messages: any[]; inputs: Record<string, any> },
  any
> {
  lc_namespace = ["hr-profiling", "OpenRouterChatWrapper"];
  async invoke({ system, messages, inputs }: { system: string; messages: any[]; inputs: Record<string, any> }) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY environment variable is not set. Chat functionality cannot work without it.");
    }
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "microsoft/phi-4-reasoning:free",
        messages: [
          { role: "system", content: system },
          ...messages,
          { role: "user", content: JSON.stringify(inputs) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`OpenRouter API error: ${response.status}`);
    const data = await response.json();
    // Return only the message content string
    return data.choices?.[0]?.message?.content || ""; 
  }
}
