# What's New: Real Authentication System

## 🎉 Major Update: Supabase Authentication

We've migrated from a mock authentication system to a real, secure authentication powered by Supabase.

## What Changed for Users

### 🔐 Real Login System

**Before**: Mock user switcher with predefined users  
**Now**: Real login with email and password

- Visit `/auth/login` to sign in
- Visit `/auth/signup` to create an account
- Your session is securely stored
- You stay logged in across page refreshes

### 🛡️ Enhanced Security

- **Encrypted Passwords**: Your password is never stored in plain text
- **Secure Sessions**: JWT-based authentication with automatic refresh
- **Row Level Security**: Data access is controlled at the database level
- **Protected Routes**: Admin pages require authentication

### 👤 User Profile

Your profile now includes:
- Email address
- Full name (first + last name)
- Role (admin, facilitator, manager, participant)
- Client association
- Active status

### 🚀 New Features

1. **Sign Up**: Create your own account at `/auth/signup`
2. **Sign In**: Secure login at `/auth/login`
3. **Sign Out**: Properly terminate your session
4. **Session Persistence**: Stay logged in even after closing your browser
5. **Profile Menu**: Access your profile from the top-right corner

## What Changed for Developers

### API Endpoints

All user-related endpoints have been renamed:

| Old Endpoint | New Endpoint |
|--------------|--------------|
| `/api/admin/users` | `/api/admin/profiles` |
| `/api/admin/users/[id]` | `/api/admin/profiles/[id]` |

### Database Schema

| Old Table | New Table |
|-----------|-----------|
| `public.users` | `public.profiles` |
| N/A | `auth.users` (Supabase managed) |

### Authentication Flow

**Before**:
```typescript
// Mock user switching
const { user, switchUser } = useAuth();
switchUser(userId);
```

**Now**:
```typescript
// Real authentication
const { user, signIn, signOut } = useAuth();
await signIn(email, password);
await signOut();
```

### Access Control

**Before**: No real access control  
**Now**: Row Level Security enforces:
- Users can only see their own data
- Users can see data from their client/projects
- Admins have full access
- Role-based permissions enforced

## Migration for Existing Users

### If You're Running This Locally

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run migrations**:
   ```bash
   npm run migrate
   ```

3. **Create test users**:
   ```bash
   node scripts/seed-auth-users.js
   ```

4. **Login with test credentials**:
   - Email: `admin@techcorp.com`
   - Password: `Admin123!`

### Test Accounts Available

After running the seed script, you can use:

| Email | Password | Role |
|-------|----------|------|
| admin@techcorp.com | Admin123! | Full Admin |
| pierre.marie@techcorp.com | Password123! | Facilitator |
| sarah.manager@techcorp.com | Password123! | Manager |
| dev.team@techcorp.com | Password123! | Participant |

## Common Questions

### Q: What happened to my old account?
A: The migration script preserves your data. You'll need to create a new password via the signup page or contact an admin.

### Q: Can I still use the system without logging in?
A: Some features may require authentication. ASK sessions can still be accessed via their unique keys.

### Q: How do I reset my password?
A: Password reset will be implemented soon. For now, contact an admin.

### Q: Is my data secure?
A: Yes! We now use industry-standard authentication with:
- Encrypted passwords (bcrypt)
- Secure session tokens (JWT)
- Row-level security
- HTTPS in production

### Q: Can I use Google/GitHub to login?
A: Not yet, but OAuth providers will be added in a future update.

## Troubleshooting

### I can't log in
1. Make sure you're using the correct email/password
2. Check that email confirmation isn't required
3. Contact an admin to verify your account status

### I'm stuck on the login page
1. Clear your browser cache and cookies
2. Try in an incognito/private window
3. Check browser console for errors

### Admin routes are redirecting to login
1. This is expected - you need to be logged in
2. Make sure you have admin privileges
3. Check that your session hasn't expired

### Data is missing in the admin panel
1. This might be due to RLS policies
2. Verify your role has appropriate permissions
3. Check with an admin

## What's Next

We're planning to add:

- 🔑 Password reset functionality
- 🔐 Two-factor authentication (2FA)
- 🌐 OAuth providers (Google, GitHub)
- 📧 Email verification
- 🖼️ Profile pictures
- 📱 Mobile app support

## Feedback

If you encounter any issues or have suggestions, please:
1. Check the troubleshooting section above
2. Review the migration documentation
3. Contact the development team

---

**Welcome to a more secure experience!** 🎉

