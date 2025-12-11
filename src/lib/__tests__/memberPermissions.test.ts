/**
 * @jest-environment node
 */

import {
  canManageProjectMembers,
  canManageClientMembers,
  canManageAskParticipants,
  canSearchProjectUsers,
  type AdminProfile
} from "../memberPermissions";

// Mock the supabaseAdmin module
jest.mock("../supabaseAdmin", () => ({
  getAdminSupabaseClient: jest.fn()
}));

import { getAdminSupabaseClient } from "../supabaseAdmin";

const mockGetAdminSupabaseClient = getAdminSupabaseClient as jest.MockedFunction<typeof getAdminSupabaseClient>;

describe("memberPermissions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("canManageProjectMembers", () => {
    it("should allow full_admin to manage any project", async () => {
      const profile: AdminProfile = {
        role: "full_admin",
        is_active: true,
        client_id: null
      };

      const result = await canManageProjectMembers(profile, "project-123");

      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should allow client_admin to manage projects of their own client", async () => {
      const profile: AdminProfile = {
        role: "client_admin",
        is_active: true,
        client_id: "client-123"
      };

      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { client_id: "client-123" },
          error: null
        })
      };
      mockGetAdminSupabaseClient.mockReturnValue(mockSupabase as any);

      const result = await canManageProjectMembers(profile, "project-123");

      expect(result.allowed).toBe(true);
      expect(result.projectClientId).toBe("client-123");
    });

    it("should deny client_admin managing projects of different client", async () => {
      const profile: AdminProfile = {
        role: "client_admin",
        is_active: true,
        client_id: "client-123"
      };

      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { client_id: "different-client" },
          error: null
        })
      };
      mockGetAdminSupabaseClient.mockReturnValue(mockSupabase as any);

      const result = await canManageProjectMembers(profile, "project-123");

      expect(result.allowed).toBe(false);
      expect(result.error).toContain("your organization");
    });

    it("should deny when project not found", async () => {
      const profile: AdminProfile = {
        role: "client_admin",
        is_active: true,
        client_id: "client-123"
      };

      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: "Not found" }
        })
      };
      mockGetAdminSupabaseClient.mockReturnValue(mockSupabase as any);

      const result = await canManageProjectMembers(profile, "project-123");

      expect(result.allowed).toBe(false);
      expect(result.error).toBe("Project not found");
    });

    it("should deny user without client_id", async () => {
      const profile: AdminProfile = {
        role: "client_admin",
        is_active: true,
        client_id: null
      };

      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { client_id: "client-123" },
          error: null
        })
      };
      mockGetAdminSupabaseClient.mockReturnValue(mockSupabase as any);

      const result = await canManageProjectMembers(profile, "project-123");

      expect(result.allowed).toBe(false);
    });

    it("should allow facilitator to manage projects of their own client", async () => {
      const profile: AdminProfile = {
        role: "facilitator",
        is_active: true,
        client_id: "client-123"
      };

      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { client_id: "client-123" },
          error: null
        })
      };
      mockGetAdminSupabaseClient.mockReturnValue(mockSupabase as any);

      const result = await canManageProjectMembers(profile, "project-123");

      expect(result.allowed).toBe(true);
    });

    it("should allow manager to manage projects of their own client", async () => {
      const profile: AdminProfile = {
        role: "manager",
        is_active: true,
        client_id: "client-123"
      };

      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { client_id: "client-123" },
          error: null
        })
      };
      mockGetAdminSupabaseClient.mockReturnValue(mockSupabase as any);

      const result = await canManageProjectMembers(profile, "project-123");

      expect(result.allowed).toBe(true);
    });
  });

  describe("canManageClientMembers", () => {
    it("should allow full_admin to manage any client", async () => {
      const profile: AdminProfile = {
        role: "full_admin",
        is_active: true,
        client_id: null
      };

      const result = await canManageClientMembers(profile, "client-123");

      expect(result.allowed).toBe(true);
    });

    it("should allow client_admin to manage their own client", async () => {
      const profile: AdminProfile = {
        role: "client_admin",
        is_active: true,
        client_id: "client-123"
      };

      const result = await canManageClientMembers(profile, "client-123");

      expect(result.allowed).toBe(true);
    });

    it("should deny client_admin managing different client", async () => {
      const profile: AdminProfile = {
        role: "client_admin",
        is_active: true,
        client_id: "client-123"
      };

      const result = await canManageClientMembers(profile, "different-client");

      expect(result.allowed).toBe(false);
      expect(result.error).toContain("your own organization");
    });

    it("should deny facilitator from managing client members", async () => {
      const profile: AdminProfile = {
        role: "facilitator",
        is_active: true,
        client_id: "client-123"
      };

      const result = await canManageClientMembers(profile, "client-123");

      expect(result.allowed).toBe(false);
      expect(result.error).toContain("client admins");
    });

    it("should deny manager from managing client members", async () => {
      const profile: AdminProfile = {
        role: "manager",
        is_active: true,
        client_id: "client-123"
      };

      const result = await canManageClientMembers(profile, "client-123");

      expect(result.allowed).toBe(false);
      expect(result.error).toContain("client admins");
    });
  });

  describe("canManageAskParticipants", () => {
    it("should allow full_admin to manage any ASK participants", async () => {
      const profile: AdminProfile = {
        role: "full_admin",
        is_active: true,
        client_id: null
      };

      const result = await canManageAskParticipants(profile, "ask-123");

      expect(result.allowed).toBe(true);
    });

    it("should allow client_admin to view ASK participants of their client", async () => {
      const profile: AdminProfile = {
        role: "client_admin",
        is_active: true,
        client_id: "client-123"
      };

      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            project_id: "project-123",
            projects: { client_id: "client-123" }
          },
          error: null
        })
      };
      mockGetAdminSupabaseClient.mockReturnValue(mockSupabase as any);

      const result = await canManageAskParticipants(profile, "ask-123");

      expect(result.allowed).toBe(true);
    });

    it("should deny viewing ASK participants of different client", async () => {
      const profile: AdminProfile = {
        role: "client_admin",
        is_active: true,
        client_id: "client-123"
      };

      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            project_id: "project-123",
            projects: { client_id: "different-client" }
          },
          error: null
        })
      };
      mockGetAdminSupabaseClient.mockReturnValue(mockSupabase as any);

      const result = await canManageAskParticipants(profile, "ask-123");

      expect(result.allowed).toBe(false);
      expect(result.error).toContain("your organization");
    });

    it("should deny when ASK not found", async () => {
      const profile: AdminProfile = {
        role: "client_admin",
        is_active: true,
        client_id: "client-123"
      };

      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: "Not found" }
        })
      };
      mockGetAdminSupabaseClient.mockReturnValue(mockSupabase as any);

      const result = await canManageAskParticipants(profile, "ask-123");

      expect(result.allowed).toBe(false);
      expect(result.error).toBe("ASK session not found");
    });
  });

  describe("canSearchProjectUsers", () => {
    it("should be the same as canManageProjectMembers", () => {
      expect(canSearchProjectUsers).toBe(canManageProjectMembers);
    });
  });
});
