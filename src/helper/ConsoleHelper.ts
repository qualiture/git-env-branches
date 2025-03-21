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

    public plotSummaryToConsole(featureBranchSummary: FeatureBranchSummary[], environmentBranches: string[]) {
        const tableData: string[][] = featureBranchSummary.map(item => this.getTableRow(item));

        this.plotTable(environmentBranches, tableData);

        // current branch can never be deleted, hence the filter
        this.plotFollowUp(featureBranchSummary);
    }

    /**
     * Converts a `FeatureBranchSummary` object to an ascii-table3-compliant `string[]` array
     * 
     * @param featureBranchData 
     * @returns 
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
     * Colors the output based on the supplied `FeatureBranchSummary` boolean flags
     * 
     * @param value 
     * @param data 
     * @returns 
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
     * After the table has been printed, this method plots additional output and/or questions to the console
     * 
     * @param featureBranchData 
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
     * Plots the feature branches and merge state into a colored ASCII table
     * 
     * @param environmentBranches 
     * @param rowArrays 
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
