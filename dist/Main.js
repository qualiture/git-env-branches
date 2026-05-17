"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const GitHelper_1 = __importDefault(require("./helper/GitHelper"));
const chalk_1 = __importDefault(require("chalk"));
const ConsoleHelper_1 = __importDefault(require("./helper/ConsoleHelper"));
class GitEnvironmentBranches {
    options;
    packageName;
    gitHelper;
    constructor(options, packageName) {
        this.options = options;
        this.packageName = packageName;
        this.gitHelper = new GitHelper_1.default();
    }
    /**
     * Executes a series of checks to validate the current Git repository and process environment branches.
     *
     * This method performs the following steps:
     * 1. Verifies if the current working directory is a valid Git repository.
     * 2. Retrieves branch options and fetches corresponding remote environment branches.
     * 3. If valid environment branches are found, generates a branch summary and displays it in the console.
     * 4. Logs appropriate messages if no valid branches are found or if the directory is not a Git repository.
     *
     * @async
     * @returns {Promise<void>} Resolves when the check execution is complete.
     */
    async executeCheck() {
        const isValidRepository = await this.gitHelper.isValidRepository();
        if (isValidRepository) {
            const branchesFromOptions = this.getBranchesFromOptions();
            if (branchesFromOptions) {
                const environmentBranches = await this.gitHelper.getRemoteEnvironmentBranches(branchesFromOptions);
                if (environmentBranches.length) {
                    const branchSummaryResult = await this.gitHelper.getBranchSummaryResult(environmentBranches);
                    const consoleHelper = new ConsoleHelper_1.default(this.options, this.packageName);
                    consoleHelper.plotSummaryToConsole(branchSummaryResult, environmentBranches);
                }
                else {
                    console.log(chalk_1.default.bold.redBright("No valid environment branches found."));
                }
            }
        }
        else {
            console.log(chalk_1.default.yellow("The current working directory is not a Git repository."));
        }
    }
    /**
     * Retrieves the list of branches from the provided options.
     *
     * @returns {string[] | null} An array of branch names if specified in the options;
     * otherwise, logs a warning message and returns `null`.
     */
    getBranchesFromOptions() {
        if (Array.isArray(this.options.branches)) {
            return this.options.branches;
        }
        console.log(chalk_1.default.yellow("You haven't specified any branches"));
        return null;
    }
}
exports.default = GitEnvironmentBranches;
