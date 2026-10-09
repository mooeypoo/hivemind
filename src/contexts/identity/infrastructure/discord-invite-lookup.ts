import { err, ok } from '../../../shared/kernel/index.ts';
import type { CommunityLookup } from '../application/ports.ts';
import { identityErrors } from '../domain/errors.ts';

const API = 'https://discord.com/api/v10';
/** Must stay in the CSP `img-src` (netlify.toml). */
const CDN = 'https://cdn.discordapp.com';

/**
 * The community's name and icon from a public invite: no sign-in or token. An invite to a
 * different server than `guildId` is ignored, so a typo can't show the wrong community.
 */
export const createDiscordInviteLookup = (
  config: { readonly inviteCode: string; readonly guildId: string },
  fetchFn: typeof fetch = fetch,
): CommunityLookup => ({
  async lookup() {
    try {
      const response = await fetchFn(`${API}/invites/${encodeURIComponent(config.inviteCode)}`);
      if (!response.ok) return err(identityErrors.discordUnavailable);
      const body = (await response.json()) as {
        guild?: { id?: unknown; name?: unknown; icon?: unknown };
      };
      const guild = body.guild;
      if (typeof guild?.id !== 'string' || typeof guild.name !== 'string') {
        return err(identityErrors.discordUnavailable);
      }
      if (guild.id !== config.guildId) {
        console.warn(
          'DISCORD_INVITE_CODE is for a different server than DISCORD_GUILD_ID; ignoring it.',
        );
        return err(identityErrors.discordUnavailable);
      }
      return ok({
        name: guild.name,
        iconUrl:
          typeof guild.icon === 'string' && guild.icon !== ''
            ? `${CDN}/icons/${guild.id}/${guild.icon}.png?size=64`
            : null,
        inviteUrl: `https://discord.gg/${config.inviteCode}`,
      });
    } catch {
      return err(identityErrors.discordUnavailable);
    }
  },
});
