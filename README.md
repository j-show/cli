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
| **Workspace utilities** | Re-exported helpers (`getGroupPackages`, Git wrappers, `execSync`, etc.) for release/backup flows and your own tooling |

---

## Requirements

- **Node.js**: 18+ recommended (library targets modern Node with ESM).
- **pnpm**: `>=10` when working in this repository (`package.json` `engines`).
- **TypeScript**: Optional at runtime; `bin/cli.mjs` loads `ts-node/esm` so `.cmd.ts` / `.plugin.ts` in the consumer project can be discovered.

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
   import { BaseCommand, type CommandContext } from '@jshow/cli';

   export default class ExampleCommand extends BaseCommand {
     static name = 'example';
     static force = false;

     public get args() {
       return {
         name: 'example',
         description: 'This is an example command',
         aliases: ['ex', 'e'],
         group: 'examples',
         plugins: ['logger', 'timer'], // Optional: specify plugins to use
         options: [
           {
             name: 'name',
             abbr: 'n',
             flagValue: true,
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
         validate: (options) => {
           // Optional: custom validation
           if (options.name && typeof options.name !== 'string') {
             return 'Name must be a string';
           }
           return null;
         },
       };
     }

     public async beforeExecute(context: CommandContext): Promise<void> {
       console.log(`Starting command: ${context.name}`);
     }

     public async execute(context: CommandContext): Promise<void> {
       const { options } = context;
       console.log(`Hello, ${String(options.name || 'world')}!`);
     }

     public async afterExecute(context: CommandContext): Promise<void> {
       console.log(`Command completed in ${Date.now() - context.startTime}ms`);
     }
   }
   ```

3. **Run the command**

   ```bash
   # Development (runs src/cli.ts via ts-node from package root)
   pnpm start

   # Production-style: build then run the published bin (loads dist/cli.mjs with ts-node loader when needed)
   pnpm build
   pnpm exec jshow example --name "jshow"
   # or, if jshow is on PATH: jshow example --name "jshow"
   ```

---

## Library usage

Compose the framework in your own Node process without cwd auto-discovery:

```typescript
import { CommandProgram, initBuiltIn, BaseCommand, type CommandContext } from '@jshow/cli';

class DeployCommand extends BaseCommand {
  static key = 'deploy';
  protected get args() {
    return { name: 'deploy', description: 'Deploy service' };
  }
  async execute(ctx: CommandContext) {
    console.log(ctx.options);
  }
}

CommandProgram.use(DeployCommand);
await initBuiltIn(CommandProgram).run();
```

- The package entry also re-exports all of `commander`, `./utils`, and `logger` (see **Utilities** below).
- **`runjShow` / `dist/cli.mjs` are not exported** from the main entry; use the `bin` or the built CLI module for full discovery.

---

## Repository scripts

| Command | Description |
| --- | --- |
| `pnpm build` | Cleans `dist/` / `out/` then runs `vite build` (library + `cli` entry as `dist/*.mjs` / `*.cjs`) |
| `pnpm test` | Runs `vitest --run` |
| `pnpm start` | `cd src && ts-node ./cli.ts` — dev CLI against the current working directory |
| `pnpm cli` | Runs `bin/cli.mjs` from `test/fixtures/empty-cli-cwd` (e.g. `pnpm cli -- --help`) |
| `pnpm clean` | `rm -rf ./dist && rm -rf ./out` (Unix); on Windows use manual removal or Git Bash if `rm` is unavailable |
| `pnpm fix:all` | Prettier + ESLint fix |

---

## Environment variables

| Variable | Where used | Description |
| --- | --- | --- |
| `JSHOW_CLI_MAX_DEPTH` | `src/cli.ts` | Max directory depth when scanning for `.cmd` / `.plugin` files under `process.cwd()` (parsed as integer, minimum `2`). |
| `JSHOW_CLI_IGNORE_NAMES` | `src/cli.ts` | Comma-separated top-level directory **names** to skip while scanning (e.g. other packages in a monorepo). |
| `JSHOW_CLI_TS_RUNTIME` | `src/cli.ts` | Set to `1` to treat the process as ts-node-capable and allow loading `.cmd.ts` / `.plugin.ts` during discovery. |
| `JSHOW_CLI_NO_TS_LOADER` | `bin/cli.mjs` | Set to `1` to run `dist/cli.mjs` without the ts-node ESM loader (`.ts` discovery files are not loaded). |
| `TS_NODE_PROJECT` / `TS_NODE_COMPILER_OPTIONS` / `execArgv` with `ts-node` | `src/cli.ts`, `bin/cli.mjs` | When set (or when the bin uses the ts-node loader), `.ts` discovery files may be loaded; otherwise only `.js` files are loaded from the workspace. |

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

## Built-in commands

Registered automatically by `initBuiltIn(CommandProgram)` before `CommandProgram.run()`:

- **`release`**: interactive flow to pick public packages, bump versions (`semver`), run `pnpm install`, `git add` / `git commit -F`, and optional `git push` (multi-repo and monorepo can run in one invocation). See [`docs/release.md`](./docs/release.md).
- **`backup`**: resolves packages via `getGroupPackages` (falls back to `.git` repo scan), optionally `git pull` per package, then copies each package’s top-level entries to an output folder (skips `node_modules`; `-c` excludes `.git`). See [`docs/backup.md`](./docs/backup.md).
- **`upgrade`**: scans workspace dependencies, lets you multi-select dependencies to query, fetches registry versions, interactively confirms per-field bumps, writes `package.json`, runs `pnpm install`, and optional Git commit/push (multi-repo vs monorepo cannot be mixed). `--force` skips commit/push prompts. See [`docs/upgrade.md`](./docs/upgrade.md) (`--local` not wired yet).

Implementations: `src/built-in/commands/`.

---

## Utilities (re-exported `utils`)

Imported from `@jshow/cli`, shared with built-in `release` / `backup`:

| Area | Symbols | Purpose |
| --- | --- | --- |
| Workspace | `getGroupPackages`, `getWorkspacePackages`, `separateGroupPackages` | Scan monorepo / multi-package roots |
| FS / process | `existsSync`, `readJsonSync`, `writeJsonSync`, `execSync`, `cpSync`, … | Safe I/O and sync subprocess |
| Git | `getCurrentBranch`, `pullCurrentBranch`, `getUnCommittedFiles`, `diffGit`, `addGit`, `commitGit`, `pushGit`, … | Release/upgrade/backup Git helpers |
| pnpm | `installPnpm`, `readPnpmCatalogs`, `PNPM_BUILT_IN_WORKSPACE`, `PNPM_BUILT_IN_CATALOG` | Install deps, catalog read, built-in prefixes |
| Prompts | `confirmInquirer`, `inputInquirer`, `checkboxInquirer`, … | Dynamic inquirer wrappers for CLI |
| Terminal | `red`, `green`, `yellow` | ANSI color helpers |
| Regexp | `toRegExp`, `toPatterns` | Comma-separated filters (e.g. `backup -f`, `upgrade -i`) |

See `src/utils/index.ts` and submodule JSDoc for the full surface.

---

## API Documentation

### Package entry (`@jshow/cli`)

The published `"."` export includes: everything from `commander`, `CommandProgram`, `initBuiltIn`, `BaseCommand` / `BasePlugin` and related types, `isCommand` / `isPlugin`, **all symbols from** `./utils`, and the shared `logger`. The runnable CLI is the separate build target `dist/cli.mjs` (wired via `bin/cli.mjs`); it is **not** re-exported from the main entry to avoid importing the package accidentally starting a CLI.

### CommandProgram

Singleton-style facade: holds the Commander root program, plugin list, and command registry.

#### Static properties

- `version: string` — read from the package’s own `package.json` next to the built `program` module.
- `program: Command` — Commander root; subcommands are mounted here in `run()`.

#### Static methods

##### `use(command: CommandClassType, force?: boolean): typeof CommandProgram`

Registers a command class. Registration key is `command.key` if set, otherwise `command.name` (note: `static name = 'foo'` overrides `Function.name`).

##### `install(plugin: PluginClassType, force?: boolean): typeof CommandProgram`

Installs a plugin class; instances are sorted by ascending `priority` (smaller runs earlier).

##### `reset(autoRun?: boolean): void`

Clears plugins/commands and rebuilds the root `Command` (intended for tests; optional `autoRun` re-inits built-ins).

##### `run(): Promise<void>`

Mounts all commands, enhances help text, then `await program.parseAsync(process.argv)`.

### `initBuiltIn`

`initBuiltIn(CommandProgram)` installs default plugins and registers built-in commands (`release`, `backup`, `upgrade`), returning `CommandProgram` for chaining.

### CommandArgs

Command argument configuration interface.

#### Properties

- `name: string` - Command name (required)
- `description?: string` - Command description
- `aliases?: string[]` - Command aliases
- `plugins?: string[]` - List of plugin names to use for this command
- `group?: string` - Command group for help organization
- `arguments?: CommandArgument[]` — positional arguments (`command.argument(...)`)
- `options?: CommandOption[]` — Commander options (`command.option(...)`)
- `examples?: string[]` - Usage examples
- `validate?: (options: Record<string, unknown>) => string | null` - Optional validation function that returns an error message or null

### CommandOption

Command option configuration interface.

#### Properties

- `name: string` - Option long name (used as `--${name}`), e.g. `'name'` or `'verbose'`
- `abbr?: string` - Option short name (single char), e.g. `'n'` for `-n`
- `flagValue?: boolean` - When `true`, the option is declared with a value placeholder (`--name <arg>` style); when `false`, it is a boolean flag
- `description?: string` - Option description
- `defaultValue?: T` - Default value for the option
- `required?: boolean` - Whether the option is required (default: `false`)
- `variadic?: boolean` - Whether this option accepts multiple values (becomes `--name <value...>`)

### BaseCommand

Command base class. All custom commands should extend this class.

#### Static properties

- `static key: string` — preferred registration key (defaults to `''`; may be filled from filename when auto-loading).
- `static force: boolean` — allow replacing an existing registration (default `false`).
- `static name = 'subcommand'` — optional; overrides `Function.name` and can be used as the registration key when `key` is empty.

#### Instance properties

- `key` (getter): resolves `static key`, else constructor `name`, else `args.name`.
- `command: Command` - Commander command instance (protected)

#### Abstract Methods

##### `execute(context: CommandContext): Promise<void>`

Command execution logic. Subclasses must implement this method.

#### Protected Methods

##### `get args(): CommandArgs`

Get command argument configuration. Subclasses must implement this getter.

The `CommandArgs` interface includes:
- `name: string` - Command name
- `description?: string` - Command description
- `aliases?: string[]` - Command aliases
- `plugins?: string[]` - List of plugin names to use for this command
- `group?: string` - Command group for help organization
- `arguments?` / `options?` — as above
- `examples?: string[]` - Usage examples
- `validate?: (options: Record<string, unknown>) => string | null` - Optional validation function

##### `beforeExecute?(context: CommandContext): Promise<void>`

Lifecycle hook executed before command execution.

##### `afterExecute?(context: CommandContext): Promise<void>`

Lifecycle hook executed after command execution.

##### `onError(error: Error, context: CommandContext): boolean`

Error handling hook. Returns `true` if error is handled, `false` otherwise.

### BasePlugin

Plugin base class. All custom plugins should extend this class.

#### Static properties

- `static key: string` — registration key (defaults to `''`).
- `static force: boolean` — allow replacing an existing plugin registration.

#### Instance properties

- `key` (getter): `static key` or constructor `name`.
- `priority: number` - Plugin priority (default: 100, lower number = higher priority)

#### Methods

##### `beforeExecute?(context: CommandContext): Promise<void>`

Lifecycle hook executed before command execution.

##### `afterExecute?(context: CommandContext): Promise<void>`

Lifecycle hook executed after command execution.

---

## File Naming Conventions

### Command Files

#### TypeScript Files

1. **File naming**: Must end with `.cmd.ts`
2. **Default export**: Must use `export default` to export the command class
3. **Extend base class**: Command class must extend `BaseCommand`
4. **Static identity**: Set `static key` and/or `static name` (used with `CommandProgram.use`); filename-derived `key` is applied when auto-loading if missing
5. **Implement methods**: Must implement `execute(context)` method and `args` getter

#### CommonJS Files

1. **File naming**: Must end with `.cmd.js`
2. **Import dependencies**: Use `require()` to import: `const { BaseCommand } = require('@jshow/cli');`
3. **Export class**: Use `module.exports` to export class (Node.js automatically treats it as default export)
4. **Extend base class**: Command class must extend `BaseCommand`
5. **Static identity**: Set `static key` and/or `static name`
6. **Implement methods**: Must implement `execute(context)` method and `args` getter

### Plugin Files

#### TypeScript Files

1. **File naming**: Must end with `.plugin.ts`
2. **Default export**: Must use `export default` to export the plugin class
3. **Extend base class**: Plugin class must extend `BasePlugin`
4. **Static identity**: Set `static key` and/or `static name`

#### CommonJS Files

1. **File naming**: Must end with `.plugin.js`
2. **Import dependencies**: Use `require()` to import: `const { BasePlugin } = require('@jshow/cli');`
3. **Export class**: Use `module.exports` to export class (Node.js automatically treats it as default export)
4. **Extend base class**: Plugin class must extend `BasePlugin`
5. **Static identity**: Set `static key` and/or `static name`

---

## Auto Discovery

The CLI automatically scans the current working directory and its subdirectories, finds all `.cmd.ts`, `.cmd.js`, `.plugin.ts`, or `.plugin.js` files and loads them automatically.

**Scanning rules**
- Starts at `process.cwd()` and recurses up to `JSHOW_CLI_MAX_DEPTH` (default `2`, minimum `2`).
- Skips dot-prefixed dirs, common junk dirs (`node_modules`, etc., see `isIgnoreDir`), names listed in `JSHOW_CLI_IGNORE_NAMES`, and the package’s own `built-in/commands` tree when it appears under the scan path.
- Only loads files ending with `.cmd.ts`, `.cmd.js`, `.plugin.ts`, or `.plugin.js`.
- `.ts` files are only considered when a ts-node-style runtime is detected; otherwise only `.js` files load.
- If the class has no `static key`, the basename (without `.cmd` / `.plugin`) is assigned to `key` before registration.

---

## Development notes

- **Library vs CLI**: import `@jshow/cli` for `CommandProgram` / `BaseCommand` / `utils`; run `jshow` (or `pnpm start` in this repo) for cwd auto-discovery. Implementation entry points: `src/index.ts` (library), `src/cli.ts` → `dist/cli.mjs` (CLI).
- **Built-in commands**: wired in `src/built-in/commands/index.ts`; add new classes there and document them in this README.
- **JSDoc**: public and internal helpers in `src/` are documented next to implementations—prefer reading source JSDoc over duplicating API lists here.

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
├── bin/cli.mjs         # Published bin: Node + ts-node loader → dist/cli.mjs
├── src/
│   ├── cli.ts          # Runnable CLI (scan cwd, initBuiltIn, parseAsync)
│   ├── index.ts        # Library entry (re-exports commander + framework + utils + logger)
│   ├── command.ts      # BaseCommand & option/argument types
│   ├── plugin.ts       # BasePlugin
│   ├── program.ts      # CommandProgram, initBuiltIn
│   ├── logger.ts       # Shared logger fork
│   ├── built-in/       # Default commands/plugins wired by initBuiltIn
│   └── utils/          # Workspace scan, git, pnpm, fs helpers
├── test/               # Vitest specs and fixtures (not published)
├── examples/           # Sample .cmd / .plugin files
├── scripts/            # Dev helpers (e.g. run-cli-help.mjs)
├── dist/               # Vite build output (gitignored)
└── ...
```

---

## License

[MIT](./LICENSE) © jShow

---

Questions or issues? Open an issue at <https://github.com/j-show/cli/issues>.
