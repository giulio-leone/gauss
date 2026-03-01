/**
 * Code execution & image generation — static utility functions.
 *
 * These functions don't require an Agent instance.
 *
 * @example
 *   import { executeCode, availableRuntimes, generateImage } from "gauss-ts";
 *
 *   const result = await executeCode("python", "print(2 + 2)");
 *   console.log(result.stdout); // "4\n"
 */
import {
  create_provider,
  destroy_provider,
  execute_code,
  available_runtimes,
  generate_image,
} from "gauss-napi";

import type {
  ProviderType,
  ProviderOptions,
  CodeExecutionResult,
  ImageGenerationConfig,
  ImageGenerationResult,
} from "./types.js";

import { resolveApiKey, detectProvider } from "./types.js";

/**
 * Execute code in a sandboxed runtime without creating a full Agent.
 *
 * @description Runs the provided code snippet in an isolated subprocess using the
 * specified language runtime. No LLM or agent is involved — this is direct code execution.
 *
 * @param language - The runtime to use: `"python"`, `"javascript"`, or `"bash"`.
 * @param code - The source code to execute.
 * @param options - Optional execution parameters.
 * @param options.timeoutSecs - Maximum execution time in seconds (default: 30).
 * @param options.workingDir - Working directory for the subprocess.
 * @param options.sandbox - Sandbox strictness level: `"default"`, `"strict"`, or `"permissive"`.
 * @returns A {@link CodeExecutionResult} containing stdout, stderr, exit code, and timing info.
 *
 * @example
 * ```ts
 * const result = await executeCode("python", "print(2 + 2)");
 * console.log(result.stdout); // "4\n"
 * console.log(result.success); // true
 * ```
 *
 * @since 1.0.0
 */
export async function executeCode(
  language: "python" | "javascript" | "bash",
  code: string,
  options?: { timeoutSecs?: number; workingDir?: string; sandbox?: "default" | "strict" | "permissive" },
): Promise<CodeExecutionResult> {
  return execute_code(language, code, options?.timeoutSecs, options?.workingDir, options?.sandbox);
}

/**
 * Check which code execution runtimes are available on this system.
 *
 * @description Probes the host system for installed language runtimes (e.g. Python, Node.js, Bash)
 * and returns the names of those that are usable with {@link executeCode}.
 *
 * @returns An array of available runtime names (e.g. `["python", "javascript", "bash"]`).
 *
 * @example
 * ```ts
 * const runtimes = await availableRuntimes();
 * console.log(runtimes); // ["python", "javascript", "bash"]
 * ```
 *
 * @since 1.0.0
 */
export async function availableRuntimes(): Promise<string[]> {
  return available_runtimes();
}

/**
 * Generate images using a provider's image generation API.
 *
 * @description Creates a temporary provider connection, sends the prompt to the image generation
 * model, and returns the result. The provider is automatically destroyed after the call.
 * Supports OpenAI DALL-E, Google Gemini, and other providers with image generation capabilities.
 *
 * @param prompt - Text description of the desired image.
 * @param options - Image generation configuration plus optional provider settings.
 * @param options.provider - LLM provider (auto-detected from env if omitted).
 * @param options.providerOptions - Provider connection options (API key auto-resolved if omitted).
 * @param options.model - Image model identifier (e.g. `"dall-e-3"`).
 * @param options.size - Desired image dimensions (e.g. `"1024x1024"`).
 * @param options.quality - Quality level (e.g. `"standard"`, `"hd"`).
 * @param options.style - Style preset (e.g. `"vivid"`, `"natural"`).
 * @param options.aspectRatio - Aspect ratio for Gemini (e.g. `"16:9"`).
 * @param options.n - Number of images to generate.
 * @param options.responseFormat - Response format (`"url"` or `"b64_json"`).
 * @returns An {@link ImageGenerationResult} containing generated image data and optional revised prompt.
 * @throws {Error} If the provider cannot be initialised or image generation fails.
 *
 * @example
 * ```ts
 * const result = await generateImage("A sunset over mountains", {
 *   provider: "openai",
 *   model: "dall-e-3",
 *   size: "1024x1024",
 * });
 * console.log(result.images[0].url);
 * ```
 *
 * @since 1.0.0
 */
export async function generateImage(
  prompt: string,
  options: ImageGenerationConfig & {
    provider?: ProviderType;
    providerOptions?: ProviderOptions;
  } = {},
): Promise<ImageGenerationResult> {
  const detected = detectProvider();
  const providerType = options.provider ?? detected?.provider ?? "openai";
  const model = options.model ?? detected?.model ?? "dall-e-3";
  const apiKey = options.providerOptions?.apiKey ?? resolveApiKey(providerType);
  const handle = create_provider(providerType, model, { apiKey, ...options.providerOptions });
  try {
    return await generate_image(
      handle,
      prompt,
      options.model,
      options.size,
      options.quality,
      options.style,
      options.aspectRatio,
      options.n,
      options.responseFormat,
    );
  } finally {
    destroy_provider(handle);
  }
}

/**
 * Gauss core native library version.
 * @since 1.0.0
 */
export { version } from "gauss-napi";
