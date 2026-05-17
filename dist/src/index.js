#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const Main_1 = __importDefault(require("./Main"));
main();
async function main() {
    const cli = new commander_1.Command();
    const packageJson = require("../package.json");
    cli
        .name(packageJson.name)
        .version(packageJson.version)
        .description("displays merged and unmerged featurebranches for the specified target branches")
        .requiredOption("-b, --branches [branchname...]", "a space-separated list of target branches (for example, '-b DEV ACC master'")
        .option("-c, --cleanup [ALL]", "if there's one or more fully merged featurebranches or local orphan branches, you get the option to delete them interactively.\n(specify 'ALL' if you want to interactively delete any branch -- USE WITH CAUTION!)")
        .parse(process.argv);
    const withOptions = cli.opts();
    const gitEnvironmentBranches = new Main_1.default(withOptions, packageJson.name);
    await gitEnvironmentBranches.executeCheck();
}
