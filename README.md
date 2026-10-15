# Test Agent (Made with Claude.ai)

A local, offline AI agent with a web interface that writes tests for you. Paste a React component or an Express route, and it first **plans** the tests, then **writes** them, then gives a **written summary** of what was covered.

It only generates tests. It never runs them or touches your code.

- **React:** Vitest + React Testing Library
- **Express / PostgreSQL:** Vitest + Supertest (database layer mocked)

Everything runs on your own machine through [Ollama](https://ollama.com). After the one-time model download, no internet is needed and no code leaves your computer.

## Requirements

- Node.js 18 or newer (`node -v` to check)
- [Ollama](https://ollama.com), installed and running
- A coding model. Pick by RAM:
  - 8 GB: `qwen2.5-coder:7b`
  - 16 GB or more: `qwen2.5-coder:14b`

## Setup

1. Install Ollama and open it. A llama icon appears in the menu bar.
2. Download a model once (needs internet):

   ```bash
   ollama pull qwen2.5-coder:7b
   ollama list    # confirm it appears
   ```

3. Start the agent from inside the project folder:

   ```bash
   cd test-agent
   npm start
   ```

4. Open http://localhost:3000

There is nothing to `npm install`, because the project has no dependencies. Keep the terminal open while you use the agent and press `Ctrl+C` to stop it.

## How to use it

1. Choose **React component** or **Express route** at the top.
2. Pick a model from the dropdown.
3. Paste the code you want to test into **Code to test**.
4. Optionally add notes, such as the file path, what to mock, or what matters most.
5. Click **Plan tests**. The plan streams in under Happy paths, Edge cases, Error cases and What to mock.
6. Edit the plan if you disagree with anything. The tests follow whatever is in the plan box.
7. Click **Write tests**. The full test file streams into **Test file**.
8. Click **Copy** to copy just the code, without the markdown fences.
9. Read the **Test summary**. It appears automatically and can be copied as bullet points with its own **Copy** button.

**Stop** cancels whatever is currently generating.

### About the summary

- The total test count and the number of `describe` blocks are counted directly from the generated code, so they are exact.
- The category breakdown (input validation, output validation, error handling, and so on) is decided by the model, so check it before relying on it. Smaller models can mislabel a test.
- Tests written with `it.skip` are not counted, and `it.each` counts as one test.

## Project structure

```
test-agent/
├── server.js        # tiny Node server: serves the UI and talks to Ollama
├── package.json
└── public/
    └── index.html   # the interface (add styles.css / script.js here if you split it)
```

If you split the page into `styles.css` and `script.js`, put them inside `public/` and make sure `server.js` serves any file in that folder, not only `index.html`. Otherwise the browser gets a 404 for them.

## Customizing the agent

All the prompting lives in `server.js`:

- `RULES` holds the testing conventions for each stack (query by role, mock the database, cover 500 errors, and so on). Edit these to match your own style, for example "always mock `db.js`".
- `buildMessages` holds the prompts for the three stages: plan, write tests, and classify tests for the summary.
- The model is set at generation time with `temperature: 0.2` and `num_ctx: 8192`. Raise `num_ctx` if you paste very long files, at the cost of more memory.

Environment variables:

| Variable     | Default                  | Purpose                  |
| ------------ | ------------------------ | ------------------------ |
| `PORT`       | `3000`                   | Port for the web UI      |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Where Ollama is running  |

## Tips for better results

- Paste one component or one route at a time.
- Use the notes field to give the file path, so the generated imports are correct.
- Review and edit the plan before writing tests. It is the cheapest place to fix mistakes.
- Always read the generated tests and run them yourself. Local models make mistakes, especially with mocks and import paths.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Model dropdown is empty or shows an error | Ollama is not running or no model is installed. Open the Ollama app and run `ollama pull qwen2.5-coder:7b`. |
| "Could not reach Ollama" | Start it with `ollama serve`, or check `OLLAMA_URL`. |
| UI looks outdated after an update | Restart `npm start`, then hard refresh with `Cmd+Shift+R`. |
| CSS or JS not loading after splitting files | Make sure the files are in `public/` and `server.js` serves them, then restart the server. |
| Generation is slow or the Mac gets sluggish | Use the smaller 7B model and close other heavy apps. |
| Tests don't match your project | Add notes about your file paths and mocks, or tweak `RULES` in `server.js`. |
