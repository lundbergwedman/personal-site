# Ask worker

Backend for the "Ask me anything" prompt on the site. GitHub Pages only serves
static files, so this Cloudflare Worker holds the OpenAI API key, adds the
profile in `src/profile.js` as context, and streams the answer back as plain
text.

## Deploy

```sh
cd worker
npm install
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
npm run deploy
```

Then put the URL Wrangler prints into `data-endpoint` on the form in
`index.html`:

```html
<form class="cc-form" data-endpoint="https://lundbergwedman-ask.<you>.workers.dev">
```

Until that's set, the prompt tells visitors the AI isn't connected yet and
points them to email.

## Notes

- Only requests from lundbergwedman.com (and `localhost:8000` for testing) are
  accepted, and each visitor gets 10 questions a minute.
- The model is set by `OPENAI_MODEL` in `wrangler.toml` (default
  `gpt-5.4-mini`). If you change it, update the `model:` line in the Ask box
  in `index.html` too.
- Answers are capped at 1024 tokens. Set a monthly budget on the OpenAI
  platform as well.
- Never put the API key in the site files. The repo and site are public.
- When the story changes, update `src/profile.js` so the AI keeps up.
