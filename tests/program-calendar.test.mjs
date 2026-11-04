import test from 'node:test';
import assert from 'node:assert/strict';
import {programCalendar} from '../lib/program-calendar.ts';

test('exporta el inicio exacto y un aviso local por actividad',()=>{
  const content=programCalendar([{id:'event-1',title:'Apertura',starts_at:'2026-11-06T12:00:00Z',ends_at:'2026-11-06T13:00:00Z'}],
    'Legado',new Date('2026-11-04T12:00:00Z'));
  assert.match(content,/DTSTART:20261106T120000Z\r\nDTEND:20261106T130000Z/);
  assert.match(content,/BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:PT0M/);
  assert.equal((content.match(/BEGIN:VEVENT/g)||[]).length,1);
});

test('escapa datos del programa y no incluye fechas inválidas',()=>{
  const content=programCalendar([
    {id:'event-2',title:'Canto, oración; cierre',description:'Línea 1\nLínea 2',location:'Carpa, norte',starts_at:'2026-11-06T18:00:00Z'},
    {id:'event-3',title:'Incompleto',starts_at:'sin fecha'},
  ],'Legado');
  assert.match(content,/SUMMARY:Canto\\, oración\\; cierre/);
  assert.match(content,/DESCRIPTION:Línea 1\\nLínea 2/);
  assert.match(content,/LOCATION:Carpa\\, norte/);
  assert.equal((content.match(/BEGIN:VEVENT/g)||[]).length,1);
});
