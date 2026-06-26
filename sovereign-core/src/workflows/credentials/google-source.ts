/**
 * `SovereignGoogleConnectionSource` -- bridges Sovereign's existing Google OAuth
 * file (`~/.sovereign/google-tokens.json`) into the workflow runtime's
 * `CredentialResolver`. When a piece asks for `sovereign:google` (or any
 * `sovereign:google:*` sub-id), the source returns the live access token
 * (refreshed on demand by `GoogleAuth.getAccessToken`) so users who already
 * authenticated Sovereign with Google see a "Sovereign Google" connection in the
 * workflow piece picker without re-authenticating per piece.
 *
 * The piece sees an `OAUTH2`-shaped value:
 *   { access_token, refresh_token, scope?, token_type, expiry_date? }
 *
 * Pieces typically only read `access_token`. We surface the full set so any
 * piece that introspects more (refresh dance, scope checks) sees consistent
 * values.
 */

import type { GoogleAuth } from "../../integrations/google-auth";
import type {
  SovereignConnectionSource,
  ResolvedConnection,
} from "./adapter";

export const SOVEREIGN_GOOGLE_PREFIX = "sovereign:google";

export class SovereignGoogleConnectionSource implements SovereignConnectionSource {
  readonly id = "google";

  constructor(private readonly googleAuth: GoogleAuth) {}

  canResolve(externalId: string): boolean {
    return externalId === SOVEREIGN_GOOGLE_PREFIX || externalId.startsWith(`${SOVEREIGN_GOOGLE_PREFIX}:`);
  }

  async resolve(_externalId: string): Promise<ResolvedConnection | null> {
    if (!this.googleAuth.isAuthenticated()) {
      // Not yet authenticated -- piece will see "connection not found".
      // Surface as null (vs throw) so other sources / repo lookups can
      // still run.
      return null;
    }
    // Trigger refresh-if-expired before reading the snapshot so the
    // returned access_token + expiry_date are consistent.
    const accessToken = await this.googleAuth.getAccessToken();
    const tokens = this.googleAuth.getTokens();
    return {
      type: "OAUTH2",
      value: {
        access_token: accessToken,
        refresh_token: tokens?.refresh_token ?? "",
        token_type: tokens?.token_type ?? "Bearer",
        ...(tokens?.expiry_date ? { expiry_date: tokens.expiry_date } : {}),
      },
    };
  }
}
