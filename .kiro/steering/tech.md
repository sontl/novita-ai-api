# Technology Stack

## Core Technologies

- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.2+ with strict mode enabled
- **Framework**: Express.js with security middleware (helmet, cors)
- **HTTP Client**: Axios with custom retry logic and circuit breaker
- **Validation**: Joi for configuration and request validation
- **Logging**: Winston with structured logging
- **Testing**: Jest with ts-jest preset
- **Linting**: ESLint with TypeScript rules

## Build System & Scripts

```bash
# Development
npm run dev          # Start with hot reload (ts-node-dev)
npm run build        # Compile TypeScript to dist/
npm run start        # Run production build

# Testing & Quality
npm run test         # Run Jest test suite
npm run test:watch   # Run tests in watch mode
npm run lint         # ESLint check
npm run lint:fix     # Auto-fix linting issues

# Docker
docker-compose up -d # Start containerized service
```

## Key Dependencies

- **axios**: HTTP client with interceptors and retry logic
- **express**: Web framework with middleware stack
- **joi**: Schema validation for config and requests  
- **winston**: Structured logging with multiple transports
- **uuid**: Unique identifier generation
- **dotenv**: Environment variable management

## Configuration

- Environment-based configuration with Joi validation
- Required: `NOVITA_API_KEY`
- Optional: Webhook URL, polling intervals, retry settings
- Docker Compose ready with health checks and resource limits

## Code Quality Standards

- TypeScript strict mode with additional compiler checks
- ESLint with TypeScript-specific rules
- Jest for unit testing with coverage reporting
- Explicit function return types preferred
- No `any` types (warn level)
- Prefer `const` over `let`, no `var`