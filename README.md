# OpenVSP AI Drone Designer

An Electron + Vite + React app for conceptual UAV/aircraft design powered by OpenVSP and an AI agent.

## What it does

- Automatically creates aircraft geometry in OpenVSP.
- Runs aerodynamic analysis with VSPAERO.
- Checks longitudinal, directional, and lateral stability.
- Compares design variants and picks the best one.
- Lets you open the generated `.vsp3` model in the OpenVSP GUI.

## Requirements

- **Node.js** + **npm**
- **OpenVSP** installed so the Python module `openvsp` can be imported: `python -c "import openvsp"`
- A **Google Generative AI API key** for Gemini

## Setup

1. Copy the environment example and add your API key:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env`:

   ```env
   GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
   ```

3. (Optional) Set the path to the OpenVSP GUI executable so the "Open in OpenVSP GUI" button works:

   ```env
   OPEN_VSP_GUI_PATH=C:\Program Files\OpenVSP-3.50.5-win64\vsp.exe
   ```

4. Install Node dependencies:

   ```bash
   npm install
   ```

## Running

Start in development mode:

```bash
npm run start
```

Package a standalone executable:

```bash
npm run package
```

The packaged app will appear in the `out/` folder.

## How to use

1. Launch the app.
2. Describe your mission in the chat, for example:  
   *"Design a fixed-wing UAV with wingspan under 2 m for 22 m/s cruise carrying a 1.5 kg payload."*
3. The AI agent spawns 5 sub-agents. Each sub-agent creates its own geometry, runs aerodynamics, and checks stability.
4. After comparison, results appear in the right panel: a parameters table, charts, and a final report.
5. To inspect a model in the OpenVSP GUI, click **Open in OpenVSP GUI** in the geometry card or inside the `Delegate Exploration` card.

## Notes

- All calculations are performed by real OpenVSP/VSPAERO tools, not fabricated by the model.
- If `import openvsp` fails in Python, check your `PYTHONPATH` or reinstall OpenVSP with Python support.
