"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chalk_1 = __importDefault(require("chalk"));
const simple_git_1 = require("simple-git");
const Constants_1 = require("../Constants");
class GitHelper {
    git = (0, simple_git_1.simpleGit)();
    /**
     * Checks if the current working directory is a valid Git repository.
     *
     * @returns {Promise<boolean>} Resolves to `true` if the current working directory is a valid Git repository; otherwise, `false`.
     */
    async isValidRepository() {
        return await this.git.checkIsRepo().catch(this.handleGitError) || false;
    }
    /**
     * Retrieves a list of valid remote environment branches from the provided branch names.
     *
     * This method checks if each branch name in the input array exists as a remote branch
     * in the repository. If a branch is not valid, it logs a warning message and excludes
     * it from the result. Valid branches are returned in an array.
     *
     * @param branches - An array of branch names to validate against the remote repository.
     * @returns A promise that resolves to an array of valid remote branch names.
     */
    async getRemoteEnvironmentBranches(branches) {
        const environmentBranches = [];
        for (const name of branches) {
            const isValidBranch = await this.git.listRemote(["--heads", "origin", `refs/heads/${name}`]).catch(() => { }) || false;
            if (!isValidBranch) {
                console.log(chalk_1.default.yellow(`'${name}' is not a valid remote branch for this repository and will be ignored.`));
            }
            else {
                environmentBranches.push(name);
            }
        }
        return environmentBranches;
    }
    /**
     * Retrieves a summary of the specified environment branches.
     *
     * This method generates a summary of the specified environment branches, including details
     * such as the last commit date, committer, and whether the branch is fully merged or not.
     *
     * @param environmentBranches - An array of valid environment branch names.
     * @returns A promise that resolves to an array of `FeatureBranchSummary` objects.
     */
    async getBranchSummaryResult(environmentBranches) {
        this.performHousekeeping();
        const remoteBranches = await this.getAllRemoteBranches();
        const remoteBranchesSummary = await this.getBranchSummaryRemoteBranches(environmentBranches, remoteBranches);
        const localBranchesSummary = await this.getBranchSummaryLocalBranches(environmentBranches, remoteBranches);
        return [...remoteBranchesSummary, ...localBranchesSummary];
    }
    /**
     * Performs housekeeping tasks for the Git repository.
     *
     * This method executes two main operations:
     * 1. Cleans the working directory by removing untracked files and directories.
     *    The operation is forced to ensure all untracked content is removed.
     * 2. Fetches updates from the remote repository while pruning any stale
     *    remote-tracking branches.
     *
     * These operations help maintain a clean and up-to-date local repository state.
     */
    performHousekeeping() {
        this.git.clean(simple_git_1.CleanOptions.FORCE);
        this.git.fetch(['--prune']);
    }
    /**
     * Retrieves all remote branches from the Git repository, sorted by the most recent commit date.
     *
     * @returns A promise that resolves to an object containing information about the remote branches.
     */
    getAllRemoteBranches() {
        return this.git.branch({ "-r": null, "--sort": "-committerdate" });
    }
    /**
     * Retrieves a summary of remote branches and their relationship to specified environment branches.
     *
     * @param environmentBranches - An array of environment branch names to compare against.
     * @param remoteBranches - A `BranchSummary` object containing details of remote branches.
     * @returns A promise that resolves to an array of `FeatureBranchSummary` objects,
     *          each representing a branch and its associated metadata.
     *
     * The returned summary includes:
     * - Commit information (date and committer).
     * - Flags indicating whether the branch is fully merged, never merged, or an environment branch.
     * - Files touched in the branch.
     * - Whether the branch is the current branch.
     * - Additional metadata such as merge status and potential conflicts.
     *
     * @throws Will throw an error if any of the asynchronous operations (e.g., fetching branch data, commit info, or files touched) fail.
     */
    async getBranchSummaryRemoteBranches(environmentBranches, remoteBranches) {
        let currentBranch = (await this.git.branchLocal()).current;
        const branchSummaryResult = [];
        const targets = {};
        for (const name of environmentBranches) {
            targets[name] = await this.getTargetBranchData(name);
        }
        if (currentBranch) {
            currentBranch = `origin/${currentBranch}`;
        }
        for (const branch in remoteBranches.branches) {
            // get commit data
            const commit = await this.getLastCommitInfo(remoteBranches.branches[branch].commit);
            // set environment branches merged or not
            const target = {};
            environmentBranches.forEach((name) => {
                target[name] = targets[name].merged.includes(branch);
            });
            const filesTouched = await this.getFilesTouchedInBranch(branch);
            // set additional flags
            const isFullyMerged = Object.values(target).every(item => item);
            const isNeverMerged = Object.values(target).every(item => !item);
            const isEnvironmentBranch = environmentBranches.map(item => `${Constants_1.Constants.ORIGIN}${item}`).includes(branch);
            // create object
            const data = {
                branch,
                committedAt: commit.commitDate,
                committedBy: commit.committer,
                target,
                filesTouched,
                isCurrent: currentBranch === branch,
                isFullyMerged,
                isNeverMerged,
                isEnvironmentBranch,
                isLocalOnly: false,
                hasPossibleConflictingFiles: false
            };
            branchSummaryResult.push(data);
        }
        return branchSummaryResult;
    }
    /**
     * Retrieves a summary of local branches that are not present in the remote repository.
     *
     * This method identifies orphaned local branches by comparing the local branches
     * with the remote branches. It then generates a summary for each orphaned branch,
     * including details such as files touched, branch metadata, and environment branch status.
     *
     * @param environmentBranches - An array of environment branch names to compare against.
     * @param remoteBranches - A summary of remote branches retrieved from the Git repository.
     * @returns A promise that resolves to an array of `FeatureBranchSummary` objects, each
     *          representing an orphaned local branch with its associated metadata.
     */
    async getBranchSummaryLocalBranches(environmentBranches, remoteBranches) {
        const localBranches = await this.git.branchLocal();
        const remoteAsLocalBranchesSet = new Set(remoteBranches.all.map(branch => branch.replace(Constants_1.Constants.ORIGIN, "")));
        const orphanLocalBranches = localBranches.all.filter(localBranch => !remoteAsLocalBranchesSet.has(localBranch));
        const branchSummaryResult = [];
        const targets = {};
        for (const name of environmentBranches) {
            targets[name] = await this.getTargetBranchData(name);
        }
        for (const i in orphanLocalBranches) {
            const branch = orphanLocalBranches[i];
            // return orphanLocalBranches.map((branch) => {
            // create object
            const target = {};
            environmentBranches.forEach((name) => {
                target[name] = false;
            });
            const filesTouched = await this.getFilesTouchedInBranch(branch);
            const data = {
                branch,
                committedAt: "",
                committedBy: "",
                target,
                filesTouched,
                isCurrent: localBranches.current === branch,
                isFullyMerged: false,
                isNeverMerged: false,
                isEnvironmentBranch: false,
                isLocalOnly: true,
                hasPossibleConflictingFiles: false
            };
            branchSummaryResult.push(data);
            // return data;
            // })
        }
        return branchSummaryResult;
    }
    /**
     * Retrieves data about the target branch, including its merged and unmerged remote branches.
     *
     * @param branchName - The name of the branch for which to retrieve data.
     * @returns A promise that resolves to an object containing the merged and unmerged remote branches.
     */
    async getTargetBranchData(branchName) {
        const merged = await this.getMergedRemoteBranches(branchName);
        const unmerged = await this.getUnMergedRemoteBranches(branchName);
        const target = {
            merged,
            unmerged
        };
        return target;
    }
    /**
     * Retrieves a list of remote branches that have been merged into the specified remote branch.
     *
     * @param remoteBranch - The name of the remote branch to check for merged branches.
     * @returns A promise that resolves to an array of strings, where each string represents the name of a merged remote branch.
     */
    async getMergedRemoteBranches(remoteBranch) {
        const branchSummary = await this.git.branch({ "-r": null, "--merged": `${Constants_1.Constants.ORIGIN}${remoteBranch}` });
        const branches = Object.keys(branchSummary.branches);
        return branches;
    }
    /**
     * Retrieves a list of remote branches that have not been merged into the specified remote branch.
     *
     * @param remoteBranch - The name of the remote branch to check for unmerged branches.
     * @returns A promise that resolves to an array of branch names that are not merged into the specified remote branch.
     */
    async getUnMergedRemoteBranches(remoteBranch) {
        const branchSummary = await this.git.branch({ "-r": null, "--no-merged": `${Constants_1.Constants.ORIGIN}${remoteBranch}` });
        const branches = Object.keys(branchSummary.branches);
        return branches;
    }
    /**
     * Retrieves information about the last commit for a given commit hash.
     *
     * @param commit - The hash of the commit to retrieve information for.
     * @returns A promise that resolves to an object containing the commit date and committer name.
     *          - `commitDate`: The date of the commit in `YYYY-MM-DD` format.
     *          - `committer`: The name of the committer, with any line breaks removed.
     */
    async getLastCommitInfo(commit) {
        const data = await this.git.show(["--no-patch", "--format=%ci,%cn", commit]);
        const splitData = data.split(",");
        return {
            commitDate: splitData[0].split(" ")[0], // just the date component
            committer: splitData[1].replace(/[\n\r]/g, "") // remove any linebreaks
        };
    }
    /**
     * Retrieves a list of file paths that have been modified in the specified Git branch.
     *
     * @param branch - The name of the branch to analyze for file changes.
     * @returns A promise that resolves to an array of file paths representing the files
     *          that have been touched (added, modified, or deleted) in the given branch.
     */
    async getFilesTouchedInBranch(branch) {
        const diffSummary = await this.git.diffSummary(["--name-only", `${branch}`]);
        const files = diffSummary.files.map(file => file.file);
        return files;
    }
    /**
     * Handles errors related to Git operations by logging them to the console.
     *
     * @param error - The GitError instance containing details about the error.
     */
    handleGitError(error) {
        console.log(chalk_1.default.yellow(error));
    }
    // #endregion
    // #region Methods for deleting remote and local branches
    /**
     * Deletes the specified branches both locally and remotely.
     *
     * @param selectedBranches - An array of branch names to be deleted.
     *                           These branches will be removed from both
     *                           the local repository and the remote repository.
     * @returns A promise that resolves when the deletion process is complete.
     */
    async deleteBranches(selectedBranches) {
        console.log();
        this.deleteRemoteBranches(selectedBranches);
        this.deleteLocalBranches(selectedBranches);
    }
    /**
     * Deletes the specified remote branches from the Git repository.
     *
     * This method takes an array of branch names, filters them to include only
     * remote branches, and then iteratively deletes each remote branch using
     * the Git CLI. If an error occurs during the deletion of a branch, it is
     * handled by the `handleGitError` method.
     *
     * @param selectedBranches - An array of branch names to be deleted. These
     * should include both local and remote branches; the method will filter
     * out only the remote branches for deletion.
     * @returns A promise that resolves when all specified remote branches
     * have been processed for deletion.
     */
    async deleteRemoteBranches(selectedBranches) {
        const remoteBranches = this.getRemoteBranchesSimplified(selectedBranches);
        if (remoteBranches.length) {
            console.log(`Deleting ${chalk_1.default.green(remoteBranches.length)} remote branches...`);
            for (const index in remoteBranches) {
                await this.git.push(["origin", "-d", remoteBranches[index]]).catch(this.handleGitError);
            }
        }
    }
    /**
     * Simplifies a list of remote branch names by filtering out branches that do not
     * originate from the remote origin and removing the origin prefix from the remaining branches.
     *
     * @param branches - An array of branch names to be processed.
     * @returns An array of simplified branch names with the origin prefix removed.
     */
    getRemoteBranchesSimplified(branches) {
        return branches
            .filter(branch => branch.startsWith(Constants_1.Constants.ORIGIN))
            .map(branch => branch.replace(Constants_1.Constants.ORIGIN, ""));
    }
    /**
     * Deletes local Git branches based on the provided selection.
     *
     * This method performs the following actions:
     * 1. Retrieves all local branches using the Git client.
     * 2. Deletes local branches that match the provided selection.
     * 3. Deletes orphaned local branches that are not part of the provided selection.
     *
     * @param selectedBranches - An array of branch names to be deleted.
     * @returns A promise that resolves when the operation is complete.
     */
    async deleteLocalBranches(selectedBranches) {
        const localBranches = (await this.git.branchLocal()).all;
        this.deleteMatchingLocalBranches(selectedBranches, localBranches);
        this.deleteOrphanLocalBranches(selectedBranches);
    }
    /**
     * Deletes local branches that match the selected remote branches.
     *
     * This method identifies the intersection of the provided local branches
     * and the simplified remote branches derived from the selected branches.
     * If matching local branches are found, they are deleted.
     *
     * @param selectedBranches - An array of branch names selected for processing.
     * @param localBranches - An array of local branch names to check for matches.
     * @returns A promise that resolves when the matching local branches are deleted.
     */
    async deleteMatchingLocalBranches(selectedBranches, localBranches) {
        const remoteBranches = this.getRemoteBranchesSimplified(selectedBranches);
        if (remoteBranches.length) {
            // Get the intersection between local and remote branches
            const matchingLocalBranches = [remoteBranches, localBranches].reduce((prev, curr) => prev.filter(item => curr.includes(item)));
            if (matchingLocalBranches.length) {
                console.log(`Deleting ${chalk_1.default.green(matchingLocalBranches.length)} local branches for the deleted remote branches...`);
                await this.git.deleteLocalBranches(matchingLocalBranches, true);
            }
            else {
                console.log("(No local branches to delete for the selected remote branches)");
            }
        }
    }
    /**
     * Deletes local orphan branches from the repository.
     *
     * This method filters the provided list of branches to identify local branches
     * that are not associated with a remote (i.e., branches that do not start with
     * the remote origin prefix). If any local orphan branches are found, they are
     * deleted using the Git client.
     *
     * @param selectedBranches - An array of branch names to process. This list may
     * include both local and remote branches.
     *
     * @returns A promise that resolves when the deletion process is complete.
     * If an error occurs during the deletion, it is handled by the `handleGitError` method.
     */
    async deleteOrphanLocalBranches(selectedBranches) {
        const localBranches = selectedBranches.filter(branch => !branch.startsWith(Constants_1.Constants.ORIGIN));
        if (localBranches.length) {
            console.log(`Deleting ${chalk_1.default.magentaBright(localBranches.length)} local orphan branches...`);
            await this.git.deleteLocalBranches(localBranches, true).catch(this.handleGitError);
        }
    }
}
exports.default = GitHelper;
