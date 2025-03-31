
export interface Bounty {
    txid: string;
    outputIndex: number;
    amount: number | undefined;
    issueId: string;
    deadline: Date;
    status: string;
  }

  export interface UserData {
    authenticated?: boolean;
    username: string;
    displayName?: string;
    avatarUrl?: string;
    // Add any other properties that might exist on userData
  }