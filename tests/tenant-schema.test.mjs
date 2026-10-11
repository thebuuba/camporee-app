import test from 'node:test';
import assert from 'node:assert/strict';
import {isTenantSchemaUnavailable} from '../lib/tenant-schema.ts';

test('reconoce tablas y columnas multiusuario aún no migradas', () => {
  assert.equal(isTenantSchemaUnavailable({code:'PGRST205',message:"Could not find the table 'public.organizations' in the schema cache"}),true);
  assert.equal(isTenantSchemaUnavailable({code:'42P01',message:'relation "public.organization_members" does not exist'}),true);
  assert.equal(isTenantSchemaUnavailable({code:'42703',message:'column camporees.organization_id does not exist'}),true);
  assert.equal(isTenantSchemaUnavailable({code:'PGRST204',message:"Could not find the 'currency' column"}),true);
});

test('no convierte errores de sesión, permisos o conexión en migraciones pendientes', () => {
  assert.equal(isTenantSchemaUnavailable({code:'42501',message:'permission denied for organizations'}),false);
  assert.equal(isTenantSchemaUnavailable({code:'PGRST116',message:'JSON object requested'}),false);
  assert.equal(isTenantSchemaUnavailable({code:'503',message:'organizations temporarily unavailable'}),false);
  assert.equal(isTenantSchemaUnavailable({code:'42P01',message:'relation unrelated does not exist'}),false);
  assert.equal(isTenantSchemaUnavailable(null),false);
});
