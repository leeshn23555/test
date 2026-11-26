# AFC · AI Fight Club

AFC is a private, browser-based multi-AI debate prototype. This branch adds a local Node.js API proxy and provider adapters. **It does not deploy the app or change GitHub Pages settings.**

## Included

- Local Node.js/Express server; browser requests go to the local server.
- Adapters for OpenAI, Gemini, Anthropic Claude, Perplexity, and xAI Grok.
- Two or three rounds: independent answer, peer critique, final position.
- GPT final judge reads the transcript.
- `/api/health` reports local demo/live mode and provider configuration.
- Local `.env` secrets are excluded by `.gitignore`.

## Run locally (no API keys required)

Requires Node.js 20 or newer.

1. Download the `afc-local-api` branch as a ZIP from GitHub, or clone that branch.
2. Open a terminal in the project folder.
3. Run `npm install`.
4. Copy `.env.example` to a new file named `.env`.
5. Keep `DEMO_MODE=true`.
6. Run `npm run dev`.
7. Open `http://127.0.0.1:3000`.

In demo mode, no provider API is called and no API key is needed. The app labels results as demo output. The server binds only to localhost and is not publicly exposed.

## Live API mode (later)

API access may involve costs and provider account age/consent requirements. A parent/guardian should review provider terms, age requirements, privacy rules, and any possible charges before real accounts or API keys are used. This project does not create accounts, purchase credits, or bypass restrictions.

After that review, a parent/guardian can configure the local `.env` file. Do not put keys in GitHub, browser storage, screenshots, or ChatGPT messages. Set `DEMO_MODE=false`, then fill the relevant key and current model ID:

- OpenAI: `OPENAI_API_KEY`, `OPENAI_MODEL`
- Gemini: `GEMINI_API_KEY`, `GEMINI_MODEL`
- Claude: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`
- Perplexity: `PERPLEXITY_API_KEY`, `PERPLEXITY_MODEL`
- Grok: `XAI_API_KEY`, `XAI_MODEL`

Model IDs are placeholders by design; provider model availability changes. The GPT API must be configured for the final judge. Other participants can be configured independently. Missing or failed providers are shown as errors, not silently replaced with fake live responses.

## Security and limitations

- Never commit `.env`; it is ignored by Git.
- Never paste API keys into ChatGPT or the browser.
- Do not expose this local server to the public internet.
- Avoid real personal or sensitive information in prompts.
- Local debate history is stored in this browser's LocalStorage.
- Live requests send the question and relevant prior-round text to the selected providers.
- This prototype does not yet include web search citations, streaming, rate limiting, multi-user accounts, or production monitoring.
- Gemini currently uses the REST `generateContent` compatibility endpoint; Google's newer Interactions API is the recommended interface for new projects, so this adapter may need migration.
- xAI uses its Responses API. OpenAI and Perplexity use Chat Completions-style endpoints; check current provider docs before changing models or request options.

## Official API references

- OpenAI: https://developers.openai.com/api/reference/chat-completions
- Gemini: https://ai.google.dev/gemini-api/docs
- Anthropic: https://docs.anthropic.com/en/api/messages
- Perplexity: https://docs.perplexity.ai/api-reference/chat-completions
- xAI: https://docs.x.ai/developers/rest-api-reference/inference/chat
