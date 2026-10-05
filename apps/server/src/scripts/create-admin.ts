/**
 * Creates the first admin user, or prints an admin invite link.
 *   pnpm create-admin <username> <display name>   (prompts for a password, or reads ADMIN_PASSWORD)
 *   pnpm create-admin --invite [origin]           (prints a one-time admin invite URL)
 */
import { createInterface } from 'node:readline/promises';
import { AuthService } from '../auth/service';
import { createDb } from '../db';

const { db, client } = createDb();
const auth = new AuthService(db);

try {
  const args = process.argv.slice(2);
  if (args[0] === '--invite') {
    const origin = args[1] ?? 'http://localhost:5173';
    const { token, invite } = await auth.createInvite({ createdBy: null, role: 'admin', note: 'bootstrap' });
    console.log(`Admin invite (expires ${invite.expiresAt.toISOString()}):\n${origin}/invite/${token}`);
  } else {
    const [username, ...nameParts] = args;
    if (!username) {
      console.error('Usage: create-admin <username> <display name> | create-admin --invite [origin]');
      process.exit(1);
    }
    let password = process.env['ADMIN_PASSWORD'] ?? '';
    if (!password) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      password = await rl.question('Password (min 10 chars): ');
      rl.close();
    }
    if (password.length < 10) {
      console.error('Password too short');
      process.exit(1);
    }
    const user = await auth.createUser({ username, displayName: nameParts.join(' ') || username, password, role: 'admin' });
    console.log(`Created admin ${user.username}`);
  }
} finally {
  await client.end();
}
