-- SOLO GG FAMILY: xnvnlmmwfpdlkolukhyh
-- SOLO LECTURA. Ejecutar exclusivamente en su SQL Editor.
-- No utilizar en otros proyectos.
select c.relname as tabla, c.relrowsecurity as rls_activo,
       c.relforcerowsecurity as rls_forzado
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='workouts' and c.relkind in ('r','p');

select policyname, cmd, roles, qual as using_expression,
       with_check as insert_check
from pg_policies
where schemaname='public' and tablename='workouts'
order by policyname;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name='workouts'
  and grantee in ('anon','authenticated')
order by grantee, privilege_type;

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='workouts'
order by ordinal_position;
