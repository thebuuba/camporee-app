import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTaskAssignees } from '../lib/task-assignees.ts';

test('sin la función nueva recupera responsables con las consultas anteriores', async () => {
  const client = {
    rpc: async (name) => {
      assert.equal(name, 'active_task_assignees');
      return { data: null, error: { code: 'PGRST202' } };
    },
    from(table) {
      if (table === 'app_members') return { select(columns) {
        assert.equal(columns, 'user_id');
        return { eq(column, value) {
          assert.equal(column, 'is_active'); assert.equal(value, true);
          return Promise.resolve({ data: [{ user_id: 'active-user' }], error: null });
        } };
      } };
      assert.equal(table, 'profiles');
      return { select(columns) {
        assert.equal(columns, 'id,full_name,email');
        return { in(column, ids) {
          assert.equal(column, 'id'); assert.deepEqual(ids, ['active-user']);
          return { order: async () => ({ data: [{ id: 'active-user', full_name: 'Ana', email: null }], error: null }) };
        } };
      } };
    },
  };
  assert.deepEqual(await loadTaskAssignees(client), {
    data: [{ id: 'active-user', full_name: 'Ana', email: null }], error: null,
  });
});

test('con la función nueva conserva cargos y no usa la consulta anterior', async () => {
  const result = { data: [{ id: 'user', full_name: 'Ana', email: null, directive_role: 'Tesorero/a' }], error: null };
  assert.deepEqual(await loadTaskAssignees({ rpc: async () => result }), result);
});

test('los errores de acceso o de red no se ocultan con una consulta alternativa', async () => {
  for (const code of ['42501', 'PGRST301', 'FETCH_ERROR']) {
    const result = { data: null, error: { code } };
    assert.deepEqual(await loadTaskAssignees({ rpc: async () => result }), result);
  }
});

test('sin miembros visibles no consulta perfiles ni muestra otros usuarios', async () => {
  const client = {
    rpc: async () => ({ data: null, error: { code: 'PGRST202' } }),
    from(table) {
      assert.equal(table, 'app_members');
      return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
    },
  };
  assert.deepEqual(await loadTaskAssignees(client), { data: [], error: null });
});
