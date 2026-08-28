CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =====================================================
-- USER ROLES
-- =====================================================

CREATE TYPE public.app_role AS ENUM
(
    'admin',
    'data_entry',
    'viewer'
);


-- =====================================================
-- USER PROFILES
-- =====================================================

CREATE TABLE IF NOT EXISTS public.profiles
(
    id UUID PRIMARY KEY
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    full_name TEXT NOT NULL,

    email TEXT NOT NULL UNIQUE,

    role public.app_role NOT NULL
        DEFAULT 'viewer',

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
);


-- =====================================================
-- EMPLOYEE TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.employees
(
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    employee_code TEXT NOT NULL UNIQUE,

    name TEXT NOT NULL,

    grade TEXT NOT NULL
        CHECK
        (
            grade IN
            (
                'Grade 1',
                'Grade 2',
                'Grade 3',
                'Grade 4'
            )
        ),

    employment_type TEXT NOT NULL
        CHECK
        (
            employment_type IN
            (
                'Regular',
                'Contractual'
            )
        ),

    post_designation TEXT NOT NULL,

    place_of_posting TEXT NOT NULL,

    dob DATE NOT NULL,

    joining_date DATE NOT NULL,

    /*
       Retirement:
       DOB + 60 years
       then last day of that month
    */

    retirement_date DATE GENERATED ALWAYS AS
    (
        (
            date_trunc(
                'month',
                (
                    dob +
                    INTERVAL '60 years'
                )::timestamp
            )
            +
            INTERVAL '1 month'
            -
            INTERVAL '1 day'
        )::date
    ) STORED,

    mobile TEXT,

    remarks TEXT,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
);


-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS
employees_grade_idx
ON public.employees(grade);


CREATE INDEX IF NOT EXISTS
employees_type_idx
ON public.employees(employment_type);


CREATE INDEX IF NOT EXISTS
employees_posting_idx
ON public.employees(place_of_posting);


CREATE INDEX IF NOT EXISTS
employees_retirement_idx
ON public.employees(retirement_date);


-- =====================================================
-- ROLE FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION
public.current_role()

RETURNS public.app_role

LANGUAGE sql

STABLE

SECURITY DEFINER

SET search_path = public

AS $$

    SELECT role
    FROM public.profiles
    WHERE id = auth.uid();

$$;


-- =====================================================
-- ENABLE RLS
-- =====================================================

ALTER TABLE public.profiles
ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.employees
ENABLE ROW LEVEL SECURITY;


-- =====================================================
-- PROFILE SECURITY
-- =====================================================

CREATE POLICY
"profiles self or admin read"

ON public.profiles

FOR SELECT

USING
(
    id = auth.uid()
    OR
    public.current_role() = 'admin'
);


-- =====================================================
-- EMPLOYEE READ
-- =====================================================

CREATE POLICY
"employees authenticated read"

ON public.employees

FOR SELECT

USING
(
    auth.uid() IS NOT NULL
);


-- =====================================================
-- EMPLOYEE INSERT
-- =====================================================

CREATE POLICY
"employees data entry insert"

ON public.employees

FOR INSERT

WITH CHECK
(
    public.current_role()
    IN
    (
        'admin',
        'data_entry'
    )
);


-- =====================================================
-- EMPLOYEE UPDATE
-- =====================================================

CREATE POLICY
"employees data entry update"

ON public.employees

FOR UPDATE

USING
(
    public.current_role()
    IN
    (
        'admin',
        'data_entry'
    )
)

WITH CHECK
(
    public.current_role()
    IN
    (
        'admin',
        'data_entry'
    )
);


-- =====================================================
-- EMPLOYEE DELETE
-- =====================================================

CREATE POLICY
"employees admin delete"

ON public.employees

FOR DELETE

USING
(
    public.current_role()
    =
    'admin'
);


-- =====================================================
-- AUTOMATIC PROFILE CREATION
-- =====================================================

CREATE OR REPLACE FUNCTION
public.handle_new_user()

RETURNS TRIGGER

LANGUAGE plpgsql

SECURITY DEFINER

SET search_path = public

AS $$

BEGIN

    INSERT INTO public.profiles
    (
        id,
        full_name,
        email,
        role
    )

    VALUES
    (
        NEW.id,

        COALESCE(
            NEW.raw_user_meta_data
                ->>'full_name',

            split_part(
                NEW.email,
                '@',
                1
            )
        ),

        NEW.email,

        COALESCE(
            (
                NEW.raw_user_meta_data
                ->>'role'
            )::public.app_role,

            'viewer'
        )
    )

    ON CONFLICT (id)
    DO NOTHING;


    RETURN NEW;

END;

$$;


DROP TRIGGER IF EXISTS
on_auth_user_created
ON auth.users;


CREATE TRIGGER
on_auth_user_created

AFTER INSERT

ON auth.users

FOR EACH ROW

EXECUTE PROCEDURE
public.handle_new_user();
