import chalk from "chalk";
import { simpleGit, SimpleGit, CleanOptions, BranchSummary, GitError } from "simple-git";
import { BranchData, EnvironmentBranchData, FeatureBranchSummary } from "../types/BranchSummary";
import { Constants } from "../Constants";

export default class GitHelper {
  
    protected git: SimpleGit = simpleGit();

    public async isValidRepository() : Promise<boolean> {
        return await this.git.checkIsRepo().catch(this.handleGitError) || false;
    }

    public async getRemoteEnvironmentBranches(branches: string[]) : Promise<string[]> {
        const environmentBranches: string[] = [];

        for (const name of branches) {
            const isValidBranch = await this.git.listRemote(["--heads", "origin", `refs/heads/${name}`]).catch(() => {}) || false;

            if (!isValidBranch) {
                console.log(chalk.yellow(`'${name}' is not a valid remote branch for this repository and will be ignored.`));
            } else {
                environmentBranches.push(name);
            }
        }

        return environmentBranches;
    }

    /**
     * Retrieve both remote and local branch data
     * 
     * @param environmentBranches All specified environment branches
     * @returns 
     */
    public async getBranchSummaryResult(environmentBranches: string[]) : Promise<FeatureBranchSummary[]> {
        this.performHousekeeping();

        const remoteBranches = await this.getAllRemoteBranches();

        const remoteBranchesSummary = await this.getBranchSummaryRemoteBranches(environmentBranches, remoteBranches);
        const localBranchesSummary = await this.getBranchSummaryLocalBranches(environmentBranches, remoteBranches);

        return [...remoteBranchesSummary, ...localBranchesSummary];
    }

    private performHousekeeping() {
        this.git.clean(CleanOptions.FORCE);
        this.git.fetch(['--prune']);
    }

    private getAllRemoteBranches() {
        return this.git.branch({ "-r": null, "--sort": "-committerdate" });
    }

    /**
     * Retrieve remote branch data
     * 
     * @param environmentBranches 
     * @param remoteBranches 
     * @returns 
     */
    private async getBranchSummaryRemoteBranches(environmentBranches: string[], remoteBranches: BranchSummary) {
        let currentBranch = (await this.git.branchLocal()).current;
        const branchSummaryResult: FeatureBranchSummary[] = [];

        const targets: BranchData = {};

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
            const target: { [key: string]: boolean; } = {};

            environmentBranches.forEach((name) => {
                target[name] = targets[name].merged.includes(branch);
            });

            const filesTouched = await this.getFilesTouchedInBranch(branch);

            // set additional flags
            const isFullyMerged = Object.values(target).every(item => item);
            const isNeverMerged = Object.values(target).every(item => !item);
            const isEnvironmentBranch = environmentBranches.map(item => `${Constants.ORIGIN}${item}`).includes(branch);

            // create object
            const data: FeatureBranchSummary = {
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
     * Retrieve local branch data
     * 
     * @param environmentBranches
     * @param remoteBranches 
     * @returns 
     */
    private async getBranchSummaryLocalBranches(environmentBranches: string[], remoteBranches: BranchSummary) : Promise<FeatureBranchSummary[]> {
        const localBranches = await this.git.branchLocal();
        const remoteAsLocalBranchesSet = new Set(remoteBranches.all.map(branch => branch.replace(Constants.ORIGIN, "")));
        const orphanLocalBranches = localBranches.all.filter(localBranch => !remoteAsLocalBranchesSet.has(localBranch));

        const branchSummaryResult: FeatureBranchSummary[] = [];

        const targets: BranchData = {};

        for (const name of environmentBranches) {
            targets[name] = await this.getTargetBranchData(name);
        }

        for (const i in orphanLocalBranches) {
            const branch = orphanLocalBranches[i];

        // return orphanLocalBranches.map((branch) => {
            // create object
            const target: { [key: string]: boolean; } = {};

            environmentBranches.forEach((name) => {
                target[name] = false;
            });

            const filesTouched = await this.getFilesTouchedInBranch(branch);
            
            const data: FeatureBranchSummary = {
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

    private async getTargetBranchData(branchName: string) : Promise<EnvironmentBranchData> {
        const merged = await this.getMergedRemoteBranches(branchName);
        const unmerged = await this.getUnMergedRemoteBranches(branchName);

        const target: EnvironmentBranchData = {
            merged,
            unmerged
        };

        return target;
    }
    
    /**
     * Retrieves all merged branches for the specified einvironmnet branch
     * 
     * @param remoteBranch 
     * @returns 
     */
    private async getMergedRemoteBranches(remoteBranch: string): Promise<string[]> {
        const branchSummary = await this.git.branch({ "-r": null, "--merged": `${Constants.ORIGIN}${remoteBranch}`});
        const branches = Object.keys(branchSummary.branches)
    
        return branches;
    }

    /**
     * Retrieves all unmerged branches for the specified environment branch
     * 
     * @param remoteBranch 
     * @returns 
     */
    private async getUnMergedRemoteBranches(remoteBranch: string): Promise<string[]> {
        const branchSummary = await this.git.branch({ "-r": null, "--no-merged": `${Constants.ORIGIN}${remoteBranch}`});
        const branches = Object.keys(branchSummary.branches)
    
        return branches;
    }

    /**
     * Retrieves the last commit date and committer
     * 
     * @param commit hash of the commit
     * @returns 
     */
    private async getLastCommitInfo(commit: string) : Promise<{ commitDate: string, committer: string }> {
        const data = await this.git.show(["--no-patch", "--format=%ci,%cn", commit]);

        const splitData = data.split(",");

        return {
            commitDate: splitData[0].split(" ")[0],        // just the date component
            committer: splitData[1].replace(/[\n\r]/g, "") // remove any linebreaks
        };
    }

    private async getFilesTouchedInBranch(branch: string) : Promise<string[]> {
        const diffSummary = await this.git.diffSummary(["--name-only", `${branch}`]);
        const files = diffSummary.files.map(file => file.file);

        return files;
    }
    
    private handleGitError(error: GitError) {
        console.log(chalk.yellow(error));
    }

    // #endregion
    
    // #region Methods for deleting remote and local branches
    /**
     * Performs deletion of both remote and (where applicable) local `branches`
     * 
     * @param selectedBranches 
     */
    public async deleteBranches(selectedBranches: string[]) {
        console.log();

        this.deleteRemoteBranches(selectedBranches);
        this.deleteLocalBranches(selectedBranches);
    }

    /**
     * Performs deletion of remote branches
     * 
     * @param selectedBranches 
     */
    private async deleteRemoteBranches(selectedBranches: string[]) {
        const remoteBranches = this.getRemoteBranchesSimplified(selectedBranches);

        if (remoteBranches.length) {
            console.log(`Deleting ${chalk.green(remoteBranches.length)} remote branches...`);

            for (const index in remoteBranches) {
                await this.git.push(["origin", "-d", remoteBranches[index]]).catch(this.handleGitError);
            }
        }
    }

    /**
     * Get remote branches from the specified branches, but stripped off the 'origin/' prefix
     * 
     * @param branches 
     * @returns 
     */
    private getRemoteBranchesSimplified(branches: string[]) : string[] {
        return branches
            .filter(branch => branch.startsWith(Constants.ORIGIN))
            .map(branch => branch.replace(Constants.ORIGIN, ""));
    }

    /**
     * Performs deletion of local branches (both deleted from remote as well as orphan)
     * 
     * @param selectedBranches 
     */
    private async deleteLocalBranches(selectedBranches: string[]) {
        const localBranches = (await this.git.branchLocal()).all;

        this.deleteMatchingLocalBranches(selectedBranches, localBranches);
        this.deleteOrphanLocalBranches(selectedBranches);
    }

    /**
     * Performs deletion of local branches matching the deleted remote branches
     * 
     * @param selectedBranches 
     * @param localBranches 
     */
    private async deleteMatchingLocalBranches(selectedBranches: string[], localBranches: string[]) {
        const remoteBranches = this.getRemoteBranchesSimplified(selectedBranches);

        if (remoteBranches.length) {
            // Get the intersection between local and remote branches
            const matchingLocalBranches = [remoteBranches, localBranches].reduce((prev, curr) => prev.filter(item => curr.includes(item)));

            if (matchingLocalBranches.length) {
                console.log(`Deleting ${chalk.green(matchingLocalBranches.length)} local branches for the deleted remote branches...`);

                await this.git.deleteLocalBranches(matchingLocalBranches, true);
            } else {
                console.log("(No local branches to delete for the selected remote branches)");
            }
        }
    }

    /**
     * Performs deletion of local orphan branches
     * 
     * @param selectedBranches 
     */
    private async deleteOrphanLocalBranches(selectedBranches: string[]) {
        const localBranches = selectedBranches.filter(branch => !branch.startsWith(Constants.ORIGIN));

        if (localBranches.length) {
            console.log(`Deleting ${chalk.magentaBright(localBranches.length)} local orphan branches...`);

            await this.git.deleteLocalBranches(localBranches, true).catch(this.handleGitError);
        }
    }

}
