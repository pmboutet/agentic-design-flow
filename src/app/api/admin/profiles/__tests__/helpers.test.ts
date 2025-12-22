/**
 * Unit tests for profile helpers
 * Pure transformation functions - no database dependencies
 */

import { mapManagedUser } from '../helpers';
import type { ClientMembership, ProjectMembership } from '@/types';

// ============================================================================
// mapManagedUser TESTS
// ============================================================================

describe('mapManagedUser', () => {
  // Base mock profile row
  const createMockRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'user-123',
    auth_id: 'auth-456',
    email: 'user@example.com',
    first_name: 'John',
    last_name: 'Doe',
    full_name: 'John Doe',
    role: 'member',
    avatar_url: 'https://example.com/avatar.jpg',
    is_active: true,
    last_login: '2024-01-15T10:00:00Z',
    job_title: 'Developer',
    description: 'A developer',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
    ...overrides,
  });

  describe('basic transformation', () => {
    it('should map all basic fields correctly', () => {
      const row = createMockRow();
      const result = mapManagedUser(row);

      expect(result.id).toBe('user-123');
      expect(result.authId).toBe('auth-456');
      expect(result.email).toBe('user@example.com');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.fullName).toBe('John Doe');
      expect(result.role).toBe('member');
      expect(result.avatarUrl).toBe('https://example.com/avatar.jpg');
      expect(result.isActive).toBe(true);
      expect(result.lastLogin).toBe('2024-01-15T10:00:00Z');
      expect(result.jobTitle).toBe('Developer');
      expect(result.description).toBe('A developer');
      expect(result.createdAt).toBe('2024-01-01T00:00:00Z');
      expect(result.updatedAt).toBe('2024-01-15T00:00:00Z');
    });

    it('should handle null job_title', () => {
      const row = createMockRow({ job_title: null });
      const result = mapManagedUser(row);

      expect(result.jobTitle).toBeNull();
    });

    it('should handle undefined job_title', () => {
      const row = createMockRow();
      delete row.job_title;
      const result = mapManagedUser(row);

      expect(result.jobTitle).toBeNull();
    });

    it('should handle null description', () => {
      const row = createMockRow({ description: null });
      const result = mapManagedUser(row);

      expect(result.description).toBeNull();
    });

    it('should handle undefined description', () => {
      const row = createMockRow();
      delete row.description;
      const result = mapManagedUser(row);

      expect(result.description).toBeNull();
    });
  });

  describe('with project membership map', () => {
    it('should include project IDs from membership map', () => {
      const row = createMockRow();
      const membershipMap = new Map<string, string[]>([
        ['user-123', ['project-1', 'project-2', 'project-3']],
      ]);

      const result = mapManagedUser(row, membershipMap);

      expect(result.projectIds).toEqual(['project-1', 'project-2', 'project-3']);
    });

    it('should sort project IDs', () => {
      const row = createMockRow();
      const membershipMap = new Map<string, string[]>([
        ['user-123', ['c-project', 'a-project', 'b-project']],
      ]);

      const result = mapManagedUser(row, membershipMap);

      expect(result.projectIds).toEqual(['a-project', 'b-project', 'c-project']);
    });

    it('should return empty array when user not in membership map', () => {
      const row = createMockRow();
      const membershipMap = new Map<string, string[]>([
        ['other-user', ['project-1']],
      ]);

      const result = mapManagedUser(row, membershipMap);

      expect(result.projectIds).toEqual([]);
    });

    it('should return empty array when membership map is undefined', () => {
      const row = createMockRow();
      const result = mapManagedUser(row, undefined);

      expect(result.projectIds).toEqual([]);
    });

    it('should handle empty membership array', () => {
      const row = createMockRow();
      const membershipMap = new Map<string, string[]>([
        ['user-123', []],
      ]);

      const result = mapManagedUser(row, membershipMap);

      expect(result.projectIds).toEqual([]);
    });
  });

  describe('with client membership map', () => {
    const createClientMembership = (overrides: Partial<ClientMembership> = {}): ClientMembership => ({
      id: 'cm-1',
      clientId: 'client-1',
      userId: 'user-123',
      role: 'client_admin',
      jobTitle: 'Admin',
      clientName: 'ACME Corp',
      clientStatus: 'active',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z',
      ...overrides,
    });

    it('should include client memberships from map', () => {
      const row = createMockRow();
      const clientMembershipMap = new Map<string, ClientMembership[]>([
        ['user-123', [
          createClientMembership({ clientId: 'client-1' }),
          createClientMembership({ clientId: 'client-2', id: 'cm-2' }),
        ]],
      ]);

      const result = mapManagedUser(row, undefined, clientMembershipMap);

      expect(result.clientMemberships).toHaveLength(2);
      expect(result.clientMemberships[0].clientId).toBe('client-1');
      expect(result.clientMemberships[1].clientId).toBe('client-2');
    });

    it('should return empty array when user not in client membership map', () => {
      const row = createMockRow();
      const clientMembershipMap = new Map<string, ClientMembership[]>([
        ['other-user', [createClientMembership()]],
      ]);

      const result = mapManagedUser(row, undefined, clientMembershipMap);

      expect(result.clientMemberships).toEqual([]);
    });

    it('should return empty array when client membership map is undefined', () => {
      const row = createMockRow();
      const result = mapManagedUser(row, undefined, undefined);

      expect(result.clientMemberships).toEqual([]);
    });
  });

  describe('with project membership map (detailed)', () => {
    const createProjectMembership = (overrides: Partial<ProjectMembership> = {}): ProjectMembership => ({
      id: 'pm-1',
      projectId: 'project-1',
      projectName: 'Project Alpha',
      projectStatus: 'active',
      clientId: 'client-1',
      clientName: 'ACME Corp',
      role: 'member',
      jobTitle: 'Developer',
      createdAt: '2024-01-01T00:00:00Z',
      ...overrides,
    });

    it('should include detailed project memberships from map', () => {
      const row = createMockRow();
      const projectMembershipMap = new Map<string, ProjectMembership[]>([
        ['user-123', [
          createProjectMembership({ projectId: 'project-1' }),
          createProjectMembership({ projectId: 'project-2', id: 'pm-2' }),
        ]],
      ]);

      const result = mapManagedUser(row, undefined, undefined, projectMembershipMap);

      expect(result.projectMemberships).toHaveLength(2);
      expect(result.projectMemberships[0].projectId).toBe('project-1');
      expect(result.projectMemberships[1].projectId).toBe('project-2');
    });

    it('should return empty array when user not in project membership map', () => {
      const row = createMockRow();
      const projectMembershipMap = new Map<string, ProjectMembership[]>([
        ['other-user', [createProjectMembership()]],
      ]);

      const result = mapManagedUser(row, undefined, undefined, projectMembershipMap);

      expect(result.projectMemberships).toEqual([]);
    });

    it('should return empty array when project membership map is undefined', () => {
      const row = createMockRow();
      const result = mapManagedUser(row, undefined, undefined, undefined);

      expect(result.projectMemberships).toEqual([]);
    });
  });

  describe('with all membership maps', () => {
    it('should combine all membership data correctly', () => {
      const row = createMockRow();

      const membershipMap = new Map<string, string[]>([
        ['user-123', ['project-1', 'project-2']],
      ]);

      const clientMembershipMap = new Map<string, ClientMembership[]>([
        ['user-123', [{
          id: 'cm-1',
          clientId: 'client-1',
          userId: 'user-123',
          role: 'client_admin',
          jobTitle: null,
          clientName: 'ACME',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        }]],
      ]);

      const projectMembershipMap = new Map<string, ProjectMembership[]>([
        ['user-123', [{
          id: 'pm-1',
          projectId: 'project-1',
          projectName: 'Alpha',
          projectStatus: 'active',
          clientId: 'client-1',
          clientName: 'ACME',
          role: 'lead',
          jobTitle: 'Tech Lead',
          createdAt: '2024-01-01T00:00:00Z',
        }]],
      ]);

      const result = mapManagedUser(
        row,
        membershipMap,
        clientMembershipMap,
        projectMembershipMap
      );

      expect(result.projectIds).toEqual(['project-1', 'project-2']);
      expect(result.clientMemberships).toHaveLength(1);
      expect(result.projectMemberships).toHaveLength(1);
      expect(result.projectMemberships[0].role).toBe('lead');
    });
  });

  describe('edge cases', () => {
    it('should handle row with null values', () => {
      const row = {
        id: 'user-123',
        auth_id: null,
        email: 'user@example.com',
        first_name: null,
        last_name: null,
        full_name: null,
        role: null,
        avatar_url: null,
        is_active: false,
        last_login: null,
        job_title: null,
        description: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: null,
      };

      const result = mapManagedUser(row);

      expect(result.id).toBe('user-123');
      expect(result.authId).toBeNull();
      expect(result.firstName).toBeNull();
      expect(result.lastName).toBeNull();
      expect(result.fullName).toBeNull();
      expect(result.role).toBeNull();
      expect(result.avatarUrl).toBeNull();
      expect(result.isActive).toBe(false);
      expect(result.lastLogin).toBeNull();
      expect(result.jobTitle).toBeNull();
      expect(result.description).toBeNull();
    });

    it('should handle empty email', () => {
      const row = createMockRow({ email: '' });
      const result = mapManagedUser(row);

      expect(result.email).toBe('');
    });

    it('should preserve role value exactly', () => {
      const roles = ['full_admin', 'client_admin', 'facilitator', 'manager', 'member', 'participant'];

      roles.forEach(role => {
        const row = createMockRow({ role });
        const result = mapManagedUser(row);
        expect(result.role).toBe(role);
      });
    });

    it('should handle very long arrays in membership maps', () => {
      const row = createMockRow();
      const manyProjects = Array.from({ length: 1000 }, (_, i) => `project-${i}`);
      const membershipMap = new Map<string, string[]>([
        ['user-123', manyProjects],
      ]);

      const result = mapManagedUser(row, membershipMap);

      expect(result.projectIds).toHaveLength(1000);
      // Should be sorted
      expect(result.projectIds[0]).toBe('project-0');
      expect(result.projectIds[999]).toBe('project-999');
    });
  });
});
