# Junk It Out

Junk It Out is a web application built with Next.js and React. The project includes application routes, reusable UI components, supporting libraries, database configuration, scripts, and automated tests.

## Technology Stack

- **Framework:** Next.js 16
- **Frontend:** React 19
- **Language:** TypeScript
- **Database ORM:** Prisma 5.22
- **Styling:** Tailwind CSS
- **Testing:** Vitest
- **File Storage:** Vercel Blob integration

## Project Structure

```text
JUNKIT/
├── app/             # Application routes and pages
├── apps/            # Additional application modules
├── components/      # Reusable UI components
├── docs/             # Project documentation
├── lib/              # Shared libraries and utilities
├── prisma/           # Database schema and seed scripts
├── public/            # Static assets
├── scripts/           # Utility and maintenance scripts
├── tests/             # Automated and standalone tests
├── AGENTS.md          # AI coding agent instructions
├── CLAUDE.md          # Claude coding agent instructions
├── package.json       # Dependencies and npm scripts
└── README.md          # Project documentation
```

## Prerequisites

Install the following before running the application:

- Node.js version compatible with the installed Next.js release
- npm
- A database supported by the project's Prisma schema
- Required environment variables

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Review `.env.example` and create a local `.env` file containing the values required by the application.

```text
DATABASE_URL="your_database_connection_string"
```

The variable above is an example. Check the Prisma schema and application code for the exact configuration required by your project.

**Security:** Never commit `.env` files, database passwords, API keys, payment credentials, or other secrets to Git.

### 3. Generate the Prisma Client

```bash
npx prisma generate
```

### 4. Start the Development Server

```bash
npm run dev
```

Open the local address printed in your terminal by Next.js.

## Available Commands

| Command | Description |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Generate the Prisma Client and build the application |
| `npm run start` | Start the production server |
| `npm test` | Run regression and standalone tests |
| `npm run test:regression` | Run the Vitest regression suite |
| `npm run test:security` | Run security route-handler tests |
| `npm run test:payments` | Run payment idempotency tests |
| `npm run test:standalone` | Run standalone workflow and reliability tests |
| `npm run db:push` | Synchronize the Prisma schema with the configured database |
| `npm run db:seed` | Run the configured Prisma seed script |
| `npm run db:seed:categories` | Seed category data |

## Database

The project uses Prisma as its database ORM.

Before running database commands:

1. Configure the required database connection in `.env`.
2. Verify the database is available.
3. Review the Prisma schema and existing migrations or database setup instructions.
4. Back up important data before making schema changes.

The `db:push` command can change the database schema. Use it only after confirming the target database and reviewing the proposed changes.

## Testing

Run the complete configured test suite:

```bash
npm test
```

Run the regression suite separately:

```bash
npm run test:regression
```

Run the security tests:

```bash
npm run test:security
```

Run payment idempotency tests:

```bash
npm run test:payments
```

Run standalone tests:

```bash
npm run test:standalone
```

Check test results before merging or deploying changes.

## Production Build

Create a production build:

```bash
npm run build
```

After a successful build, start the production server:

```bash
npm run start
```

Ensure production environment variables and database configuration are set correctly before deployment.

## Environment and Secrets

- Keep local secrets in `.env`.
- Use `.env.example` to document required environment variable names without real secret values.
- Configure production secrets through the hosting platform's environment settings.
- Never expose private server-side keys in browser-accessible variables.
- Do not commit credentials or sensitive customer data.

## Development Guidelines

- Follow the instructions in `AGENTS.md` before making code changes.
- Review relevant existing code before changing API routes or database behavior.
- Preserve existing API contracts unless a change has been agreed upon.
- Add or update regression tests when fixing bugs.
- Avoid unrelated changes while addressing a specific issue.
- Run appropriate tests before committing changes.

## Troubleshooting

### Prisma connection errors

Verify the database URL, credentials, database availability, and environment configuration. Regenerate the Prisma Client when needed.

### Build failures

Review the first meaningful error in the terminal output, check the installed Node.js version, and verify that required environment variables are available.

### Test failures

Run the failing test independently when possible, inspect its dependencies and fixtures, and confirm that the configured test environment is correct.

## License

The `package.json` currently specifies the ISC license. Confirm the project's intended licensing terms before distributing the application.