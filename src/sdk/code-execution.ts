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
 * @example
 *   const result = await executeCode("python", "print(2 + 2)");
 *   console.log(result.stdout); // "4\n"
 */
export async function executeCode(
  language: "python" | "javascript" | "bash",
  code: string,
  options?: { timeoutSecs?: number; workingDir?: string; sandbox?: "default" | "strict" | "permissive" },
): Promise<CodeExecutionResult> {
  return execute_code(language, code, options?.timeoutSecs, options?.workingDir, options?.sandbox);
}

/** Check which code runtimes are available on this system. */
export async function availableRuntimes(): Promise<string[]> {
  return available_runtimes();
}

/**
 * Generate images using a provider's image generation API.
 *
 * @example
 *   const result = await generateImage("A sunset over mountains", {
 *     provider: "openai",
 *     model: "dall-e-3",
 *     size: "1024x1024",
 *   });
 *   console.log(result.images[0].url);
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

/** Gauss core version. */
export { version } from "gauss-napi";
