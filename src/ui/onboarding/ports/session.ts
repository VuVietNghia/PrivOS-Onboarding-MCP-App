export interface ActorSession {
  roomId: string;
  roomType: 'c' | 'p' | 'unsupported';
  userId: string;
  roles: readonly string[];
  grantedScopes: readonly string[];
}
