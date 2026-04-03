'use strict';

jest.mock('../../../apps/api/src/modules/user/user.repository', () => ({
  findById: jest.fn(),
  findByEmail: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  list: jest.fn(),
  count: jest.fn(),
}));

jest.mock('../../../packages/cache/cacheManager', () => ({
  cacheManager: {
    getJSON: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../../../packages/security/passwordHasher', () => ({
  hashPassword: jest.fn(),
}));

jest.mock('../../../packages/security/tokenManager', () => ({
  invalidateRole: jest.fn(),
  isBlacklisted: jest.fn(),
  blacklistToken: jest.fn(),
  getRefreshSession: jest.fn(),
  revokeRefreshSession: jest.fn(),
  upsertRefreshSession: jest.fn(),
}));

jest.mock('../../../packages/event-bus/eventBus', () => ({
  eventBus: {
    publish: jest.fn(),
  },
}));

jest.mock('../../../packages/logger/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const userRepository = require('../../../apps/api/src/modules/user/user.repository');
const { cacheManager } = require('../../../packages/cache/cacheManager');
const { hashPassword } = require('../../../packages/security/passwordHasher');
const { invalidateRole } = require('../../../packages/security/tokenManager');
const { eventBus } = require('../../../packages/event-bus/eventBus');
const userService = require('../../../apps/api/src/modules/user/user.service');

const baseUser = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Sample User',
  email: 'sample@example.com',
  role: 'viewer',
  status: 'active',
  created_at: new Date(),
  updated_at: new Date(),
};

describe('userService.createUser()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    hashPassword.mockResolvedValue('$2a$12$hashedpassword');
    cacheManager.set.mockResolvedValue(true);
  });

  it('creates a new user, hashes password, and caches user data', async () => {
    userRepository.findByEmail.mockResolvedValueOnce(null);
    userRepository.create.mockResolvedValueOnce(baseUser);

    const result = await userService.createUser({
      name: 'Sample User',
      email: 'Sample@Example.com',
      password: 'Password123',
      role: 'viewer',
    });

    expect(hashPassword).toHaveBeenCalledWith('Password123');
    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        name: 'Sample User',
        email: 'sample@example.com',
        role: 'viewer',
        status: 'active',
      })
    );
    expect(cacheManager.set).toHaveBeenCalledWith(
      `user:${baseUser.id}`,
      expect.objectContaining({ id: baseUser.id, role: baseUser.role, status: baseUser.status }),
      expect.any(Number)
    );
    expect(cacheManager.set).toHaveBeenCalledWith(
      `user:${baseUser.id}:role`,
      baseUser.role,
      expect.any(Number)
    );
    expect(result).not.toHaveProperty('password_hash');
  });

  it('throws 409 when email is already registered', async () => {
    userRepository.findByEmail.mockResolvedValueOnce(baseUser);

    await expect(
      userService.createUser({
        name: 'Sample User',
        email: 'sample@example.com',
        password: 'Password123',
        role: 'viewer',
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws validation error for invalid role assignment', async () => {
    await expect(
      userService.createUser({
        name: 'Sample User',
        email: 'sample@example.com',
        password: 'Password123',
        role: 'super-admin',
      })
    ).rejects.toThrow();
  });
});

describe('userService.updateUser()', () => {
  const adminActor = {
    user_id: '550e8400-e29b-41d4-a716-446655440100',
    role: 'admin',
  };

  const viewerActor = {
    user_id: baseUser.id,
    role: 'viewer',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    cacheManager.del.mockResolvedValue(true);
    cacheManager.set.mockResolvedValue(true);
    invalidateRole.mockResolvedValue(undefined);
  });

  it('invalidates cache when admin updates role', async () => {
    userRepository.findById.mockResolvedValueOnce(baseUser);
    userRepository.update.mockResolvedValueOnce({ ...baseUser, role: 'analyst' });

    const result = await userService.updateUser(baseUser.id, { role: 'analyst' }, adminActor);

    expect(result.role).toBe('analyst');
    expect(cacheManager.del).toHaveBeenCalledWith(
      `user:${baseUser.id}`,
      `user:${baseUser.id}:role`
    );
    expect(invalidateRole).toHaveBeenCalledWith(baseUser.id);
    expect(eventBus.publish).toHaveBeenCalledWith(
      'user.updated',
      expect.objectContaining({
        user_id: baseUser.id,
        actor_user_id: adminActor.user_id,
      })
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      'user.role.changed',
      expect.objectContaining({
        user_id: baseUser.id,
        old_role: 'viewer',
        new_role: 'analyst',
      })
    );
  });

  it('allows non-admin to update only own name', async () => {
    userRepository.findById.mockResolvedValueOnce(baseUser);
    userRepository.update.mockResolvedValueOnce({ ...baseUser, name: 'Renamed User' });

    const result = await userService.updateUser(
      baseUser.id,
      { name: 'Renamed User' },
      viewerActor
    );

    expect(result.name).toBe('Renamed User');
    expect(userRepository.update).toHaveBeenCalledWith(
      baseUser.id,
      expect.objectContaining({ name: 'Renamed User' })
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      'user.updated',
      expect.objectContaining({
        user_id: baseUser.id,
        actor_user_id: viewerActor.user_id,
      })
    );
    expect(eventBus.publish).not.toHaveBeenCalledWith(
      'user.role.changed',
      expect.anything()
    );
  });

  it('rejects non-admin role updates', async () => {
    userRepository.findById.mockResolvedValueOnce(baseUser);

    await expect(
      userService.updateUser(baseUser.id, { role: 'admin' }, viewerActor)
    ).rejects.toThrow();

    expect(userRepository.update).not.toHaveBeenCalled();
  });
});

describe('userService.listUsers()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns paginated users', async () => {
    userRepository.list.mockResolvedValueOnce([baseUser]);
    userRepository.count.mockResolvedValueOnce(1);

    const result = await userService.listUsers({ page: '1', limit: '10' });

    expect(result.data).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.limit).toBe(10);
  });
});