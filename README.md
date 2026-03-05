# INF222 V26 - Obligatory Assignment 2

This project contains a skeleton for INF222 V26 - Obligatory 2.

## Install and setup

1. Clone this repository
2. Install Node on your computer
   - https://nodejs.org/en/download
3. Open project folder in VScode
4. Run command `npm install`

## Run part 1
To generate/regenerate the TypeScript files, execute the following command in the terminal:
```
npm run langium:generate
```
You will need to rerun this command every time you make changes to your grammar.

## Run part 2
To build the project with your validations, execute the following command in the terminal:
```
npm run build
```
To run a VSCode instance with your extenstion, press the `F5` button.

## Run part 3
To compile a given sourcefile and save a wasm file, execute the following command in the terminal:  
**Mac/Linux**
```
./packages/cli/bin/cli.js generate <input file> <destination>
```
**Windows**
```
.\packages\cli\bin\cli.js generate <input file> <destination>
```

Before you can run the following command, you will have to define it [here](packages/cli/src/main.ts). Instructions on how to do this will follow with the task description for part-3.
To compile a given sourcefile and run it, execute the following command in the terminal:  
**Mac/Linux**
```
./packages/cli/bin/cli.js run <input file>
```
**Windows**
```
.\packages\cli\bin\cli.js run <input file>
```


If you have any problems with this, please contact a group leader during group session or on Discord.

## Tips

Don't forget to use the group sessions if you have any issues.

Below is as short overview of what the different parts of this project is.
- [packages/language](./packages/language/README.md) This is where you will write the language definition.
- [packages/cli](./packages/cli/README.md) This is where we will do the compilation to WebAssembly.
- [packages/extension](./packages/extension/langium-quickstart.md) Contains the VSCode extension, we will not make changes here.

## What's in the folder?

Some file are contained in the root directory as well.

- [package.json](./package.json) - The manifest file the main workspace package
- [tsconfig.json](./tsconfig.json) - The base TypeScript compiler configuration
- [tsconfig.build.json](./package.json) - Configuration used to build the complete source code.
- [.gitignore](.gitignore) - Files ignored by git
