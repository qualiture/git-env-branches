import { OptionValues } from "commander";
import GitHelper from "./helper/GitHelper";
import chalk from "chalk";
import ConsoleHelper from "./helper/ConsoleHelper";

export default class GitEnvironmentBranches {
    protected options: OptionValues;
    protected packageName: string;
    protected gitHelper: GitHelper;

    constructor(options: OptionValues, packageName: string) {
        this.options = options;
        this.packageName = packageName;

        this.gitHelper = new GitHelper();
    }

    public async executeCheck() {
        const isValidRepository = await this.gitHelper.isValidRepository();

        if (isValidRepository) {
            const branchesFromOptions = this.getBranchesFromOptions();

            if (branchesFromOptions) {
                const environmentBranches = await this.gitHelper.getRemoteEnvironmentBranches(branchesFromOptions);

                if (environmentBranches.length) {
                    const branchSummaryResult = await this.gitHelper.getBranchSummaryResult(environmentBranches);
                    
                    const consoleHelper = new ConsoleHelper(this.options, this.packageName);

                    consoleHelper.plotSummaryToConsole(branchSummaryResult, environmentBranches);
                } else {
                    console.log(chalk.bold.redBright("No valid environment branches found."));
                }
            }
        } else {
            console.log(chalk.yellow("The current working directory is not a Git repository."));
        }
    }

    private getBranchesFromOptions() {
        if (Array.isArray(this.options.branches)) {
            return this.options.branches as string[];
        }

        console.log(chalk.yellow("You haven't specified any branches"));

        return null;
    }

}
