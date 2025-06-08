# Contributing to Cursor Pulse

Thanks for your interest in contributing! This guide covers the essentials to get you started.

## Quick Start

1. **Setup**

   ```bash
   git clone https://github.com/your-username/cursor-pulse.git
   cd cursor-pulse
   npm install
   ```

2. **Development**

   ```bash
   npm run watch    # Auto-rebuild on changes
   # Press F5 in VSCode to launch Extension Development Host
   ```

3. **Testing**
   ```bash
   npm test         # Run all tests (92 tests)
   ```

## Project Structure

```
src/
├── services/     # Core business logic (API, data, database)
├── ui/          # Status bar and UI components
├── utils/       # Logging and utilities
├── types/       # TypeScript interfaces
├── test/        # Unit tests (92 tests)
└── extension.ts # Entry point
```

## Development Workflow

### Making Changes

1. Create feature branch: `git checkout -b feature/your-feature`
2. Make changes and test: `npm run watch` + `F5` in VSCode
3. Run tests: `npm test`
4. Format code: `npm run format`
5. Submit PR with clear description

### Key Commands

```bash
npm run watch      # Auto-rebuild during development
npm test          # Run all tests
npm run format    # Format code with Prettier
npm run lint      # Check code quality
npm run package   # Build for production
```

## Code Style

- **Formatting**: Prettier (2 spaces, double quotes, 120 chars)
- **Linting**: ESLint with TypeScript rules
- **Testing**: Comprehensive unit tests required for new features
- **Commits**: Use conventional format: `feat(scope): description`

## Architecture

- **DataService**: Singleton for data management and caching
- **StatusBarProvider**: VSCode status bar integration with animations
- **ApiService**: Cursor API integration and error handling
- **DatabaseService**: SQLite access for user data

## Testing

We have 92 comprehensive tests covering:

- Data service caching and API integration
- Status bar animations and UI logic
- Database operations and error handling
- Extension lifecycle and commands

Add tests for new features following existing patterns in `src/test/`.

## Debugging

- **Logs**: Use "Cursor Pulse: Show Logs" command or check Output panel
- **Breakpoints**: Set in source files, press F5 to debug
- **Common Issues**: Check logs for database path or API connectivity issues

## Pull Request Guidelines

- Include tests for new functionality
- Follow existing code patterns and style
- Update documentation if needed
- Ensure all tests pass (`npm test`)
- Keep PRs focused and reasonably sized

## Getting Help

- **Issues**: Report bugs or request features on GitHub
- **Questions**: Use GitHub Discussions
- **Code Review**: Tag maintainers for assistance

That's it! The codebase is well-structured and documented. Check the `.cursor/rules/` directory for
detailed architecture notes.
