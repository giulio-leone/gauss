const { createProvider, agentRun, version } = require('gauss-napi');

async function main() {
  console.log(`Gauss Core Version: ${version()}`);

  // 1. Create a Provider (Mock or Real)
  // For testing without API keys, we might hit an error if the provider validates eagerly.
  // Let's try to create a dummy OpenAiProvider.
  // Note: Rust side might check for empty API key depending on implementation.
  // Inspecting Rust code: ProviderConfig::new(&options.api_key) - likely just stores it.
  
  try {
    const providerHandle = createProvider("openai", "gpt-3.5-turbo", {
      apiKey: "DUMMY_KEY", // Clearly fake key for testing
      baseUrl: undefined,
      timeoutMs: undefined,
      maxRetries: 0,
      organization: undefined
    });
    console.log(`Provider created with handle: ${providerHandle}`);

    // 2. Prepare Agent Run Args
    const tools = []; // Empty tools for now
    const messages = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello from NAPI!" }
    ];
    const options = {
      temperature: 0.7,
      maxTokens: 100
    };

    console.log("Running agent (this will fail with dummy key, but verifies signature)...");

    try {
      const result = await agentRun(
        "test-agent",
        providerHandle,
        tools,
        messages,
        options
      );
      console.log("Agent Result:", result);
    } catch (e) {
      const errMsg = e?.message || String(e);
      console.log("Agent run failed (expected with dummy key):", errMsg);
      if (errMsg.includes("401") || errMsg.includes("api key")) {
          console.log("SUCCESS: NAPI call reached the provider logic!");
      } else {
          console.log("WARNING: Unexpected error type.");
      }
    }

  } catch (e) {
    console.error("Failed to create provider:", e);
  }
}

main();
