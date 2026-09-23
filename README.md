# rplace-frontend

A small React + Vite frontend for a collaborative pixel-art board inspired by r/place.

## Prerequisites

Before running the app, make sure you have:

- Node.js 18 or newer
- npm

## Installation

1. Open a terminal in the project root.
2. Install dependencies:

```bash
npm install
```

## Run locally

Start the development server:

```bash
npm run dev
```

Then open the local URL shown in the terminal, usually:

```text
http://localhost:5173
```

## Build for production

Create a production build:

```bash
npm run build
```

To preview the production build locally:

```bash
npm run preview
```

## Project structure

```text
src/
  App.tsx
  Board.tsx
  main.tsx
  index.css
public/
  favicon.svg
  icons.svg
```

## Notes

- The app is designed for local development and experimentation.
- If you want to connect it to a backend or real-time multiplayer service, you can extend the board logic in the React components.
