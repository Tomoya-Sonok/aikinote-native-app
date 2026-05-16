// Last-Write-Wins (LWW) 判定ヘルパ。
//
// 同一エンティティに対してローカルとリモートの両方で編集が起きた場合、
// updated_at が新しい方を採用する。タイムゾーンは ISO 8601 (UTC) で
// ms 精度を保つこと前提。同一 ms の場合はローカル優先。

export interface LWWComparable {
  updated_at: string;
}

/**
 * リモート (remote) の方が新しければ true。同タイムスタンプはローカル優先で false。
 *
 * 用途: Pull 時に「リモート行で SQLite を上書きしてよいか」の判定。
 * Push 時の競合チェックでも、Push 直前にリモートを GET して同関数で判定する。
 */
export function shouldOverwriteWithRemote(
  local: LWWComparable,
  remote: LWWComparable,
): boolean {
  const localMs = new Date(local.updated_at).getTime();
  const remoteMs = new Date(remote.updated_at).getTime();
  return remoteMs > localMs;
}
