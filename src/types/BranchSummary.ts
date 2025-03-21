export interface FeatureBranchSummary {
    branch: string;                     // branch name
    commit?: string;                    // last commit
    committedBy?: string;               // last commit done by
    committedAt?: string;               // last commit at
    target: { [key: string]: any };     // object with target environment branches
    filesTouched: string[];             // list of modified files
    isCurrent: boolean;                 // indicates whether feature is currently checked out
    isFullyMerged: boolean;             // indicates whether feature is merged in all specified environments
    isNeverMerged: boolean;             // indicates whether feature is not merged (or is already ahead of first merge),
    isEnvironmentBranch: boolean;       // indicates whether featurebranch is equal to one of the specified environment branches
    isLocalOnly: boolean;               // indicates local (orphan) branches
    hasPossibleConflictingFiles: boolean;
}

export interface EnvironmentBranchData {
    merged: string[];                   // which branches are merged, and...
    unmerged: string[];                 // ...which are not
}

export type BranchData = Record<string, EnvironmentBranchData>;
