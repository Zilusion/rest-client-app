# REST Client

## Technical Stack 💻

_In our project we use the following technologies:_

- **Frontend**:
  - [React](https://reactjs.org/) with [TypeScript](https://www.typescriptlang.org/)
  - [Next.js](https://nextjs.org/)
  - [Shadcn](https://ui.shadcn.com/)
  - [Redux](https://redux.js.org/)
  - [Tailwind CSS](https://tailwindcss.com/)
  - [Firebase](https://firebase.google.com/)

- **Code Quality**: [Husky](https://typicode.github.io/husky/), [Prettier](https://prettier.io/), [ESLint](https://eslint.org/)

- **Testing**: [Vitest](https://vitest.dev/)

## How to Run the Project

_To run the project locally, follow these steps:_

1. Clone the repository: `git clone https://github.com/Zilusion/rest-client-app.git`
2. Navigate to the project folder: `cd rest-client-app`
3. Copy `.env.example` to `.env.local` and provide the Firebase credentials
4. Install dependencies: `npm ci`
5. Run the project: `npm run dev`
6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Demo Deployment

The public demo runs as a standalone Next.js container. Authentication uses
Firebase Identity Toolkit, while sessions and request history are handled only
by the server through Firebase Admin. The outbound request executor rejects
private networks, non-HTTP protocols, oversized payloads, and unsupported
ports.

GitHub Actions publishes multi-platform images to
`ghcr.io/zilusion/rest-client-demo`. The runtime Compose file is available at
`deploy/compose.yml`; the Firebase Admin JSON must be mounted separately and
must never be committed.

## Available Scripts 📑

_You can run the following scripts in the project directory:_

- `npm run dev`: Starts the Next.js development server
- `npm run build`: Builds the application for production
- `npm run start`: Runs the built application in production mode
- `npm run lint`: Lints the codebase using ESLint
- `npm run format`: Formats code with Prettier
- `npm run prepare`: Sets up Husky git hooks
- `npm run test`: Runs tests with Vitest
- `npm run coverage`: Generates test coverage reports
