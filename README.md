<p align="center">
  <a href="https://jshow.org" target="_blank">
    <img width="100" src="https://jshow.org/images/jshow.png" alt="jShow logo" />
  </a>
</p>

<h1 align="center">@jshow/cli</h1>

<p align="center">
  English | <a href="./README_CN.md">简体中文</a>
</p>

---

## Overview

`@jshow/cli` is a command line tool set for `jShow`, developed based on [commander](https://www.npmjs.com/package/commander). It provides a powerful and extensible CLI framework with automatic command discovery, plugin system, and full TypeScript support.

The CLI automatically scans and loads command files (`.cmd.ts` or `.cmd.js`) and plugin files (`.plugin.ts` or `.plugin.js`) from your project, making it easy to build custom CLI tools with minimal configuration.

---

## Features

| Feature | Description |
| --- | --- |
| **Auto Command Discovery** | Automatically scans and loads command files (`.cmd.ts` or `.cmd.js`) in the project |
| **Plugin System** | Support for plugins with lifecycle hooks (beforeExecute, afterExecute) |
| **Command Registration** | Support custom command registration for easy command extension |
| **Type Safety** | Full TypeScript type support |
| **Commander Export** | Exports the entire `commander` library for direct use |
| **Command Base Class** | Provides `BaseCommand` abstract base class to simplify command development |
| **Command Grouping** | Organize commands into groups for better help information display |

---

## Why @jshow/cli?

- **Zero Configuration** – Automatically discovers and loads commands/plugins from your project without manual registration.
- **Type-Safe** – Full TypeScript support with comprehensive type definitions for commands, plugins, and options.
- **Extensible** – Plugin system allows you to add cross-cutting concerns like logging, timing, and error handling.
- **Commander Integration** – Built on top of Commander.js, exports the entire library for advanced use cases.
- **Developer Friendly** – Simple base classes and clear conventions make it easy to create and maintain commands.
- **Modern Tooling** – Built for modern Node.js with ESM support and TypeScript-first design.

---

## Quick Start

1. **Install dependencies**

   ```bash
   pnpm add @jshow/cli
   # or
   npm install @jshow/cli
   # or
   yarn add @jshow/cli
   ```

2. **Create a command file**

   Create a file ending with `.cmd.ts` or `.cmd.js` in your project:

   ```typescript
   // example.cmd.ts
   import { BaseCommand, CommandContext } from '@jshow/cli';

   export default class ExampleCommand extends BaseCommand {
     static name = 'example';
     static force = false;

     protected get args() {
       return {
         name: 'example',
         description: 'This is an example command',
         aliases: ['ex', 'e'],
         group: 'examples',
         options: [
           {
             flag: '--name <value>',
             abbreviation: '-n',
             description: 'Name parameter',
             defaultValue: 'world',
             required: false,
           },
         ],
         examples: [
           'jshow example',
           'jshow example --name "jshow"',
           'jshow ex -n "test"',
         ],
       };
     }

     protected beforeExecute(context: CommandContext): void {
       console.log(`Starting command: ${context.name}`);
     }

     public execute(): void {
       const options = this.command.opts();
       console.log(`Hello, ${options.name || 'world'}!`);
     }

     protected afterExecute(context: CommandContext): void {
       console.log(`Command completed in ${Date.now() - context.startTime}ms`);
     }
   }
   ```

3. **Run the command**

   ```bash
   # Development mode
   pnpm start

   # Or build and run
   pnpm build
   jshow example --name "jshow"
   ```

---

## Repository Scripts

| Command | Description |
| --- | --- |
| `pnpm build` | Builds the library and CLI entry point, outputs to `dist/` |
| `pnpm build:lib` | Builds only the library package |
| `pnpm build:cli` | Builds only the CLI entry point |
| `pnpm start` | Runs the CLI in development mode using ts-node |
| `pnpm clean` | Removes build outputs (`dist/` and `out/` directories) |

---

## Examples

The `examples/` directory contains working examples:

### TypeScript Examples

- `hello.cmd.ts` – A simple Hello World command demonstrating basic command structure
- `greet.cmd.ts` – A command with options, aliases, and validation
- `build.cmd.ts` – A complex command using plugins and command grouping

### CommonJS Examples

- `hello.cmd.js` – A basic command example using CommonJS syntax
- `build.cmd.js` – A command with plugins example using CommonJS syntax

### Plugin Examples

- `logger.plugin.ts` – A logging plugin with lifecycle hooks (priority: 50)
- `timer.plugin.ts` – A timing plugin for performance monitoring (priority: 100)
- `error-handler.plugin.ts` – An error handling plugin example (priority: 200)

See [`examples/README.md`](./examples/README.md) for detailed usage instructions.

---

## API Documentation

### CommandProgram

Command program manager, responsible for command registration and execution.

#### Static Properties

- `version: string` - CLI version number
- `program: Command` - Commander program instance

#### Static Methods

##### `use(command: CommandClass, force?: boolean): CommandProgram`

Register a command class.

**Parameters:**
- `command: CommandClass` - Command class (extends `BaseCommand`)
- `force?: boolean` - Whether to force override if command already exists (default: `false`)

**Returns:** `CommandProgram` instance (supports chaining)

##### `install(plugin: PluginClass, force?: boolean): CommandProgram`

Install a plugin.

**Parameters:**
- `plugin: PluginClass` - Plugin class (extends `BasePlugin`)
- `force?: boolean` - Whether to force override if plugin already exists (default: `false`)

**Returns:** `CommandProgram` instance (supports chaining)

##### `run(): void`

Run the CLI program, parse command line arguments and execute the corresponding command.

### BaseCommand

Command base class. All custom commands should extend this class.

#### Static Properties

- `name: string` - Command name (required)
- `force: boolean` - Whether to force override if command with same name exists (default: `false`)
- `plugins: string[]` - List of plugin names to use for this command

#### Instance Properties

- `name: string` - Get command name (read-only)
- `command: Command` - Commander command instance (protected)

#### Abstract Methods

##### `execute(): void`

Command execution logic. Subclasses must implement this method.

#### Protected Methods

##### `get args(): CommandArgs`

Get command argument configuration. Subclasses must implement this getter.

##### `beforeExecute?(context: CommandContext): void`

Lifecycle hook executed before command execution.

##### `afterExecute?(context: CommandContext): void`

Lifecycle hook executed after command execution.

##### `onError(error: Error, context: CommandContext): boolean`

Error handling hook. Returns `true` if error is handled, `false` otherwise.

### BasePlugin

Plugin base class. All custom plugins should extend this class.

#### Static Properties

- `name: string` - Plugin name (required)
- `force: boolean` - Whether to force override if plugin with same name exists (default: `false`)

#### Instance Properties

- `name: string` - Get plugin name (read-only)
- `priority: number` - Plugin priority (default: 100, lower number = higher priority)

#### Methods

##### `beforeExecute?(context: CommandContext): void`

Lifecycle hook executed before command execution.

##### `afterExecute?(context: CommandContext): void`

Lifecycle hook executed after command execution.

---

## File Naming Conventions

### Command Files

#### TypeScript Files

1. **File naming**: Must end with `.cmd.ts`
2. **Default export**: Must use `export default` to export the command class
3. **Extend base class**: Command class must extend `BaseCommand`
4. **Static properties**: Must set `static name` property
5. **Implement methods**: Must implement `execute()` method and `args` getter

#### CommonJS Files

1. **File naming**: Must end with `.cmd.js`
2. **Import dependencies**: Use `require()` to import: `const { BaseCommand } = require('@jshow/cli');`
3. **Export class**: Use `module.exports` to export class (Node.js automatically treats it as default export)
4. **Extend base class**: Command class must extend `BaseCommand`
5. **Static properties**: Must set `static name` property
6. **Implement methods**: Must implement `execute()` method and `args` getter

### Plugin Files

#### TypeScript Files

1. **File naming**: Must end with `.plugin.ts`
2. **Default export**: Must use `export default` to export the plugin class
3. **Extend base class**: Plugin class must extend `BasePlugin`
4. **Static properties**: Must set `static name` property

#### CommonJS Files

1. **File naming**: Must end with `.plugin.js`
2. **Import dependencies**: Use `require()` to import: `const { BasePlugin } = require('@jshow/cli');`
3. **Export class**: Use `module.exports` to export class (Node.js automatically treats it as default export)
4. **Extend base class**: Plugin class must extend `BasePlugin`
5. **Static properties**: Must set `static name` property

---

## Auto Discovery

The CLI automatically scans the current working directory and its subdirectories, finds all `.cmd.ts`, `.cmd.js`, `.plugin.ts`, or `.plugin.js` files and loads them automatically.

**Scanning Rules:**
- Recursively scan from `process.cwd()`
- Only load files ending with `.cmd.ts`, `.cmd.js`, `.plugin.ts`, or `.plugin.js`
- Automatically extract command/plugin name from filename (remove `.cmd` or `.plugin` suffix)

---

## Development Workflow

1. `pnpm install` – Install dependencies
2. Create command files (`.cmd.ts` or `.cmd.js`) or plugin files (`.plugin.ts` or `.plugin.js`) in your project
3. `pnpm start` – Run in development mode
4. `pnpm build` – Build for production
5. Test your commands with `jshow <command>`

---

## Directory Layout

```
├── src/
│   ├── cli.ts          # CLI entry point
│   ├── command.ts      # Command base class and types
│   ├── plugin.ts       # Plugin base class and types
│   ├── program.ts      # Command program manager
│   └── index.ts        # Main export
├── examples/           # Example commands and plugins
├── scripts/            # Build scripts
├── dist/               # Build outputs (gitignored)
└── ...
```

---

## License

[MIT](./LICENSE) © jShow

---

Questions or issues? Open an issue at <https://github.com/j-show/cli/issues>.
