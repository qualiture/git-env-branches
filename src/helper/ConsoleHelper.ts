import chalk from "chalk";
import { FeatureBranchSummary } from "../types/BranchSummary";
import { OptionValues } from "commander";
import { AsciiTable3 } from "ascii-table3";
import GitHelper from "./GitHelper";
import prompts, { PromptObject } from "prompts";

export default class ConsoleHelper {

    protected options: OptionValues;
    protected packageName: string;

    protected gitHelper: GitHelper;

    constructor(options: OptionValues, packageName: string) {
        this.options = options;
        this.packageName = packageName;

        this.gitHelper = new GitHelper();
    }

    /**
     * Outputs a summary of feature branches to the console in a tabular format and provides follow-up actions.
     *
     * @param featureBranchSummary - An array of `FeatureBranchSummary` objects representing the details of feature branches.
     * @param environmentBranches - An array of strings representing the names of environment branches.
     */
    public plotSummaryToConsole(featureBranchSummary: FeatureBranchSummary[], environmentBranches: string[]) {
        const tableData: string[][] = featureBranchSummary.map(item => this.getTableRow(item));

        this.plotTable(environmentBranches, tableData);

        // current branch can never be deleted, hence the filter
        this.plotFollowUp(featureBranchSummary);
    }

    /**
     * Generates a table row representation for a given feature branch summary.
     *
     * @param featureBranchData - An object containing details about the feature branch,
     * including its name, whether it is the current branch, files touched, commit information,
     * and merge status with target environment branches.
     * 
     * @returns An array of strings representing the table row, where each value is colorized
     * based on the feature branch data.
     */
    private getTableRow(featureBranchData: FeatureBranchSummary) : string[] {
        let featureBranch = `${featureBranchData.isCurrent ? "* " : ""}${featureBranchData.branch}`;
        let environmentBranchesMergeInfo = Object.values(featureBranchData.target).map(isMerged => isMerged ? "X" : "");

        const rowArray: string[] = [
            featureBranch,
            featureBranchData.filesTouched.length.toString(),
            featureBranchData.committedAt as string,
            featureBranchData.committedBy as string,
            ...environmentBranchesMergeInfo
        ].map(value => this.getColorizedValue(value, featureBranchData));

        return rowArray;
    }

    /**
     * Returns a colorized string based on the properties of the provided `FeatureBranchSummary` object.
     * The colorization is determined by the branch's status:
     * - Grey: If the branch is an environment branch.
     * - Green: If the branch is fully merged.
     * - Yellow: If the branch has never been merged.
     * - Magenta Bright: If the branch exists only locally.
     * - White Bright and Bold: For all other cases.
     *
     * @param value - The string value to be colorized.
     * @param data - An object of type `FeatureBranchSummary` containing branch status information.
     * @returns The colorized string based on the branch's status.
     */
    private getColorizedValue(value: string, data: FeatureBranchSummary) : string {
        if (data.isEnvironmentBranch) {
            return chalk.grey(value);
        } else if (data.isFullyMerged) {
            return chalk.green(value);
        } else if (data.isNeverMerged) {
            return chalk.yellow(value);
        } else if (data.isLocalOnly) {
            return chalk.magentaBright(value);
        } else {
            return chalk.whiteBright.bold(value);
        }
    }

    /**
     * Analyzes and categorizes feature branch data, providing feedback on their statuses
     * and optionally performing cleanup operations based on the specified options.
     *
     * @param featureBranchData - An array of `FeatureBranchSummary` objects representing
     * the branches to be analyzed.
     *
     * The method categorizes branches into the following groups:
     * - Fully merged branches that are not environment branches.
     * - Branches that have never been merged.
     * - Branches that can be merged but are not fully merged, not local-only, and not environment branches.
     * - Orphan local branches.
     *
     * Depending on the `cleanup` option, the method may:
     * - Log the number of branches in each category and their statuses.
     * - Warn if the current branch is eligible for deletion but is checked out.
     * - Perform cleanup operations to remove eligible branches.
     * - Suggest a command to interactively remove branches if cleanup is not enabled.
     *
     * If no branches require action, a message indicating no housekeeping is necessary is logged.
     */
    private plotFollowUp(featureBranchData: FeatureBranchSummary[]) {
        const fullyMergedBranches = featureBranchData.filter(branch => branch.isFullyMerged && !branch.isEnvironmentBranch);
        const neverMergedBranches = featureBranchData.filter(branch => branch.isNeverMerged);
        const canBeMergedBranches = featureBranchData.filter(branch => !branch.isFullyMerged && !branch.isNeverMerged && !branch.isEnvironmentBranch && !branch.isLocalOnly);
        const orphanLocalBranches = featureBranchData.filter(branch => branch.isLocalOnly);

        let warnCurrentBranch;
        
        if (canBeMergedBranches.length) {
            console.log(`${chalk.whiteBright.bold(canBeMergedBranches.length)} branches have not been merged to all specified branches`);

            const eligibleForDeletionButCheckedOut = canBeMergedBranches.find(branch => branch.isCurrent);
            if (eligibleForDeletionButCheckedOut) {
                warnCurrentBranch = chalk.whiteBright.bold(eligibleForDeletionButCheckedOut.branch);
            }
        }

        if (fullyMergedBranches.length) {
            console.log(`${chalk.green.bold(fullyMergedBranches.length)} branches appear to be fully merged and may be removed`);

            const eligibleForDeletionButCheckedOut = fullyMergedBranches.find(branch => branch.isCurrent);
            if (eligibleForDeletionButCheckedOut) {
                warnCurrentBranch = chalk.green.bold(eligibleForDeletionButCheckedOut.branch);
            }
        }

        if (orphanLocalBranches.length) {
            console.log(`${chalk.magentaBright.bold(orphanLocalBranches.length)} branches appear to be local orphans and may be removed`);

            const eligibleForDeletionButCheckedOut = orphanLocalBranches.find(branch => branch.isCurrent);
            if (eligibleForDeletionButCheckedOut) {
                warnCurrentBranch = chalk.magentaBright.bold(eligibleForDeletionButCheckedOut.branch);
            }
        }

        if (neverMergedBranches.length) {
            console.log(`${chalk.yellow.bold(neverMergedBranches.length)} branches appear to either a) not have been merged, or b) is still in early stages of development`);

            const eligibleForDeletionButCheckedOut = neverMergedBranches.find(branch => branch.isCurrent);
            if (eligibleForDeletionButCheckedOut) {
                warnCurrentBranch = chalk.yellow.bold(eligibleForDeletionButCheckedOut.branch);
            }
        }

        const eligibleForDeletion = this.options.cleanup === "ALL" ? [...canBeMergedBranches, ...fullyMergedBranches, ...neverMergedBranches, ...orphanLocalBranches] : [...fullyMergedBranches, ...orphanLocalBranches];

        if (eligibleForDeletion.length) {
            if (this.options.cleanup) {
                if (warnCurrentBranch) {
                    console.log(`\nNB: Since branch ${warnCurrentBranch} is currently checked out, switch to another branch first if you want to remove it.`);
                }

                if (eligibleForDeletion.filter(branch => !branch.isCurrent).length) {
                    this.doCleanup(eligibleForDeletion.filter(branch => !branch.isCurrent), this.options.cleanup);
                }
            } else {
                const command = `${this.packageName} -b ${this.options.branches.join(" ")} --cleanup`;

                console.log(`\nNB: You may run ${chalk.bold.cyan(command)} to interactively remove fully merged branches and/or orphan local branches`);

                if (warnCurrentBranch) {
                    console.log(`    Since branch ${warnCurrentBranch} is currently checked out, switch to another branch first if you want to remove it.`);
                }        
            }
        } else if (!canBeMergedBranches.length && !neverMergedBranches.length) {
            console.log("No housekeeping necessary it seems -- keep up the good work! 👍");
        }
    }

    /**
     * Handles the cleanup process for feature branches by prompting the user for confirmation
     * and branch selection, and then deleting the selected branches if confirmed.
     *
     * @param branchesToClean - An array of `FeatureBranchSummary` objects representing the branches
     *                          that are eligible for cleanup.
     * @param cleanup - A string indicating the cleanup mode. If set to "ALL", all branches are considered;
     *                  otherwise, only fully merged branches and/or local orphan branches are considered.
     *
     * The method displays a caution message to the user, warning them to verify the branches before deletion.
     * It then prompts the user with a series of questions:
     * 1. Whether they want to delete branches.
     * 2. If yes, a multiselect prompt to choose specific branches to delete.
     * 3. A final confirmation prompt to ensure the user wants to delete the selected branches.
     *
     * If the user confirms the deletion, the selected branches are deleted using the `gitHelper.deleteBranches` method.
     */
    private async doCleanup(branchesToClean: FeatureBranchSummary[], cleanup: string) {
        const caution = new AsciiTable3()
            .setStyle("unicode-round")
            .addRowMatrix([[chalk.italic("CAUTION: Although it may appear these branches are all safe to delete, it could well be that they are still being used and just not have been merged yet! Always contact the developer(s) first before actually deleting branches!")]])
            .setWidth(1, 82).setWrapped(1);
        
            console.log("\n" + caution.toString());

        const questions: PromptObject[] = [
            {
                type: "confirm",
                name: "askDeleteMergedBranches",
                message: `Do you want to delete (a selection of) ${cleanup !== "ALL" ? "fully merged branches and/or local orphan" : "all"} branches?`
            },
            {
                type: prev => prev ? 'multiselect' : null,
                name: 'featureBranches',
                message: 'Select feature branches to remove',
                choices: branchesToClean.map((branch) => {
                    return { title: this.getColorizedValue(branch.branch, branch), value: branch.branch }
                })
            },
            {
                type: prev => prev?.length ? "confirm" : null,
                name: "confirmDelete",
                message: prev => `Are you sure you want to delete these ${prev.length} selected branches?`
            }
        ];

        (async () => {
            console.log();

            const response = await prompts(questions);

            if (response?.confirmDelete) {
                this.gitHelper.deleteBranches(response.featureBranches);
            }
            
        })();
    }

    /**
     * Outputs a tabular representation of the provided feature branch data to the console.
     *
     * @param environmentBranches - An array of strings representing the names of environment branches.
     * @param rowArrays - An array of arrays containing the data for each row in the
     * table, where each inner array represents a row and contains the branch name,
     * number of files touched, last commit information, and merge status with environment branches.
     */
    private plotTable(environmentBranches: string[], rowArrays: string[][]) {
        const table = new AsciiTable3("Merged / unmerged branches")
            .setHeading("Feature branch", "# files", "Last commit", "By", ...environmentBranches)
            .setStyle("unicode-round")
            .setAlignRight(2)
            .addRowMatrix(rowArrays);

        console.log();
        console.log(table.toString());
    }

}
