--
-- PostgreSQL database dump
--

\restrict c8dA6J3fHu1kecX2oZVYPApGNnhrCbABdg9THNoYiKNpP4c7GTTtdCbgjoHelgL

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: voip; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA voip;


ALTER SCHEMA voip OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit; Type: TABLE; Schema: voip; Owner: postgres
--

CREATE TABLE voip.audit (
    id integer NOT NULL,
    sheet_id integer,
    user_id integer NOT NULL,
    action text NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE voip.audit OWNER TO postgres;

--
-- Name: audit_id_seq; Type: SEQUENCE; Schema: voip; Owner: postgres
--

CREATE SEQUENCE voip.audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE voip.audit_id_seq OWNER TO postgres;

--
-- Name: audit_id_seq; Type: SEQUENCE OWNED BY; Schema: voip; Owner: postgres
--

ALTER SEQUENCE voip.audit_id_seq OWNED BY voip.audit.id;


--
-- Name: campaigns; Type: TABLE; Schema: voip; Owner: postgres
--

CREATE TABLE voip.campaigns (
    id integer NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#7058e8'::text NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE voip.campaigns OWNER TO postgres;

--
-- Name: campaigns_id_seq; Type: SEQUENCE; Schema: voip; Owner: postgres
--

CREATE SEQUENCE voip.campaigns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE voip.campaigns_id_seq OWNER TO postgres;

--
-- Name: campaigns_id_seq; Type: SEQUENCE OWNED BY; Schema: voip; Owner: postgres
--

ALTER SEQUENCE voip.campaigns_id_seq OWNED BY voip.campaigns.id;


--
-- Name: dialers; Type: TABLE; Schema: voip; Owner: postgres
--

CREATE TABLE voip.dialers (
    id integer NOT NULL,
    campaign_id integer NOT NULL,
    name text NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE voip.dialers OWNER TO postgres;

--
-- Name: dialers_id_seq; Type: SEQUENCE; Schema: voip; Owner: postgres
--

CREATE SEQUENCE voip.dialers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE voip.dialers_id_seq OWNER TO postgres;

--
-- Name: dialers_id_seq; Type: SEQUENCE OWNED BY; Schema: voip; Owner: postgres
--

ALTER SEQUENCE voip.dialers_id_seq OWNED BY voip.dialers.id;


--
-- Name: entries; Type: TABLE; Schema: voip; Owner: postgres
--

CREATE TABLE voip.entries (
    sheet_id integer NOT NULL,
    dialer_id integer NOT NULL,
    slot integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    CONSTRAINT entries_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT entries_slot_check CHECK (((slot >= 0) AND (slot < 48)))
);


ALTER TABLE voip.entries OWNER TO postgres;

--
-- Name: schema_migrations; Type: TABLE; Schema: voip; Owner: postgres
--

CREATE TABLE voip.schema_migrations (
    name text NOT NULL
);


ALTER TABLE voip.schema_migrations OWNER TO postgres;

--
-- Name: sessions; Type: TABLE; Schema: voip; Owner: postgres
--

CREATE TABLE voip.sessions (
    token_hash text NOT NULL,
    user_id integer NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


ALTER TABLE voip.sessions OWNER TO postgres;

--
-- Name: sheets; Type: TABLE; Schema: voip; Owner: postgres
--

CREATE TABLE voip.sheets (
    id integer NOT NULL,
    name text NOT NULL,
    report_date date NOT NULL,
    config jsonb NOT NULL,
    version integer DEFAULT 0 NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE voip.sheets OWNER TO postgres;

--
-- Name: sheets_id_seq; Type: SEQUENCE; Schema: voip; Owner: postgres
--

CREATE SEQUENCE voip.sheets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE voip.sheets_id_seq OWNER TO postgres;

--
-- Name: sheets_id_seq; Type: SEQUENCE OWNED BY; Schema: voip; Owner: postgres
--

ALTER SEQUENCE voip.sheets_id_seq OWNED BY voip.sheets.id;


--
-- Name: user_audit; Type: TABLE; Schema: voip; Owner: postgres
--

CREATE TABLE voip.user_audit (
    id integer NOT NULL,
    user_id integer NOT NULL,
    action text NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE voip.user_audit OWNER TO postgres;

--
-- Name: user_audit_id_seq; Type: SEQUENCE; Schema: voip; Owner: postgres
--

CREATE SEQUENCE voip.user_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE voip.user_audit_id_seq OWNER TO postgres;

--
-- Name: user_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: voip; Owner: postgres
--

ALTER SEQUENCE voip.user_audit_id_seq OWNED BY voip.user_audit.id;


--
-- Name: users; Type: TABLE; Schema: voip; Owner: postgres
--

CREATE TABLE voip.users (
    id integer NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    role text DEFAULT 'admin'::text NOT NULL,
    deleted_at timestamp with time zone,
    version integer DEFAULT 0 NOT NULL,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'super_admin'::text])))
);


ALTER TABLE voip.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: voip; Owner: postgres
--

CREATE SEQUENCE voip.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE voip.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: voip; Owner: postgres
--

ALTER SEQUENCE voip.users_id_seq OWNED BY voip.users.id;


--
-- Name: vendor_audit; Type: TABLE; Schema: voip; Owner: postgres
--

CREATE TABLE voip.vendor_audit (
    id integer NOT NULL,
    report_id integer NOT NULL,
    user_id integer NOT NULL,
    action text NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE voip.vendor_audit OWNER TO postgres;

--
-- Name: vendor_audit_id_seq; Type: SEQUENCE; Schema: voip; Owner: postgres
--

CREATE SEQUENCE voip.vendor_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE voip.vendor_audit_id_seq OWNER TO postgres;

--
-- Name: vendor_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: voip; Owner: postgres
--

ALTER SEQUENCE voip.vendor_audit_id_seq OWNED BY voip.vendor_audit.id;


--
-- Name: vendor_reports; Type: TABLE; Schema: voip; Owner: postgres
--

CREATE TABLE voip.vendor_reports (
    id integer NOT NULL,
    name text NOT NULL,
    report_date date NOT NULL,
    config jsonb NOT NULL,
    entries jsonb DEFAULT '[]'::jsonb NOT NULL,
    version integer DEFAULT 0 NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE voip.vendor_reports OWNER TO postgres;

--
-- Name: vendor_reports_id_seq; Type: SEQUENCE; Schema: voip; Owner: postgres
--

CREATE SEQUENCE voip.vendor_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE voip.vendor_reports_id_seq OWNER TO postgres;

--
-- Name: vendor_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: voip; Owner: postgres
--

ALTER SEQUENCE voip.vendor_reports_id_seq OWNED BY voip.vendor_reports.id;


--
-- Name: vendors; Type: TABLE; Schema: voip; Owner: postgres
--

CREATE TABLE voip.vendors (
    id integer NOT NULL,
    name text NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE voip.vendors OWNER TO postgres;

--
-- Name: vendors_id_seq; Type: SEQUENCE; Schema: voip; Owner: postgres
--

CREATE SEQUENCE voip.vendors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE voip.vendors_id_seq OWNER TO postgres;

--
-- Name: vendors_id_seq; Type: SEQUENCE OWNED BY; Schema: voip; Owner: postgres
--

ALTER SEQUENCE voip.vendors_id_seq OWNED BY voip.vendors.id;


--
-- Name: audit id; Type: DEFAULT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.audit ALTER COLUMN id SET DEFAULT nextval('voip.audit_id_seq'::regclass);


--
-- Name: campaigns id; Type: DEFAULT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.campaigns ALTER COLUMN id SET DEFAULT nextval('voip.campaigns_id_seq'::regclass);


--
-- Name: dialers id; Type: DEFAULT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.dialers ALTER COLUMN id SET DEFAULT nextval('voip.dialers_id_seq'::regclass);


--
-- Name: sheets id; Type: DEFAULT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.sheets ALTER COLUMN id SET DEFAULT nextval('voip.sheets_id_seq'::regclass);


--
-- Name: user_audit id; Type: DEFAULT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.user_audit ALTER COLUMN id SET DEFAULT nextval('voip.user_audit_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.users ALTER COLUMN id SET DEFAULT nextval('voip.users_id_seq'::regclass);


--
-- Name: vendor_audit id; Type: DEFAULT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.vendor_audit ALTER COLUMN id SET DEFAULT nextval('voip.vendor_audit_id_seq'::regclass);


--
-- Name: vendor_reports id; Type: DEFAULT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.vendor_reports ALTER COLUMN id SET DEFAULT nextval('voip.vendor_reports_id_seq'::regclass);


--
-- Name: vendors id; Type: DEFAULT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.vendors ALTER COLUMN id SET DEFAULT nextval('voip.vendors_id_seq'::regclass);


--
-- Data for Name: audit; Type: TABLE DATA; Schema: voip; Owner: postgres
--

COPY voip.audit (id, sheet_id, user_id, action, detail, created_at) FROM stdin;
1	1	1	Entries saved	{"count": 1, "changes": [{"slot": 0, "amount": 40, "previous": null, "dialer_id": 1}]}	2026-10-21 00:46:41.415093+05
2	1	1	Dialer added	{"campaign": "ACA", "dialerName": "2.7"}	2026-10-21 00:54:17.178136+05
3	1	1	Entries saved	{"count": 2, "changes": [{"slot": 1, "amount": 30, "previous": null, "dialer_id": 1}, {"slot": 0, "amount": 50, "previous": null, "dialer_id": 2}]}	2026-10-21 01:14:10.366391+05
4	2	1	Entries saved	{"count": 2, "changes": [{"slot": 0, "amount": 40, "previous": null, "dialer_id": 1}, {"slot": 1, "amount": 70, "previous": null, "dialer_id": 1}]}	2026-10-21 02:02:08.587678+05
\.


--
-- Data for Name: campaigns; Type: TABLE DATA; Schema: voip; Owner: postgres
--

COPY voip.campaigns (id, name, color, deleted_at) FROM stdin;
1	ACA	#7557de	\N
2	MED MAIN	#2a9b8d	\N
3	MED 2.0	#4d8bd9	\N
4	HI	#d99a3d	\N
5	CGM	#cf6d9a	\N
6	FE	#7083cf	\N
7	MVA	#8b97aa	\N
\.


--
-- Data for Name: dialers; Type: TABLE DATA; Schema: voip; Owner: postgres
--

COPY voip.dialers (id, campaign_id, name, deleted_at) FROM stdin;
1	1	ACA_Balitech_i5	\N
2	1	ACA_Balitechi55	\N
3	1	ACA_Balitech_i6	\N
4	2	MED_MAIN_BaliTGPT7	\N
5	2	MED_MAIN_BT1	\N
6	2	MED_MAIN_BaliMED3	\N
7	2	MED_BaliMED 5	\N
8	2	MED_MAIN_BTrev1	\N
9	3	MED_2.O_Balitechmed 8	\N
10	3	MED_2.O_BaliMED1	\N
11	3	MED_2.O_BaliMED2	\N
12	3	MED_2.O_ACAGPT1s	\N
13	3	MED_2.O_BaliMED4	\N
14	3	MED_2.O_BaliMED 6	\N
15	4	ACA_HI_Balitechi4_i5	\N
16	5	CGM_Balitech7.i5-CGM	\N
17	6	FE_BalitechFE	\N
18	7	MVA_BalitechISB	\N
19	1	2.6	\N
21	1	2.7	\N
\.


--
-- Data for Name: entries; Type: TABLE DATA; Schema: voip; Owner: postgres
--

COPY voip.entries (sheet_id, dialer_id, slot, amount) FROM stdin;
1	1	0	40.00
1	1	1	30.00
1	2	0	50.00
2	1	0	40.00
2	1	1	70.00
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: voip; Owner: postgres
--

COPY voip.schema_migrations (name) FROM stdin;
initial-vendors
user-roles-v1
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: voip; Owner: postgres
--

COPY voip.sessions (token_hash, user_id, expires_at) FROM stdin;
b645b0438ff9d07224489608a342b331f313ddfd308ccfa799d27553ea145ea2	1	2026-10-21 14:47:53.545876+05
\.


--
-- Data for Name: sheets; Type: TABLE DATA; Schema: voip; Owner: postgres
--

COPY voip.sheets (id, name, report_date, config, version, created_by, created_at, updated_at) FROM stdin;
1	Balitech · VoIP report	2026-10-21	{"slots": [{"end": "19:00", "start": "18:30", "dayOffset": 0}, {"end": "19:30", "start": "19:00", "dayOffset": 0}, {"end": "20:00", "start": "19:30", "dayOffset": 0}, {"end": "20:30", "start": "20:00", "dayOffset": 0}, {"end": "21:00", "start": "20:30", "dayOffset": 0}, {"end": "21:30", "start": "21:00", "dayOffset": 0}, {"end": "22:00", "start": "21:30", "dayOffset": 0}, {"end": "22:30", "start": "22:00", "dayOffset": 0}, {"end": "23:00", "start": "22:30", "dayOffset": 0}, {"end": "23:30", "start": "23:00", "dayOffset": 0}, {"end": "00:00", "start": "23:30", "dayOffset": 0}, {"end": "00:30", "start": "00:00", "dayOffset": 1}, {"end": "01:00", "start": "00:30", "dayOffset": 1}, {"end": "01:30", "start": "01:00", "dayOffset": 1}, {"end": "02:00", "start": "01:30", "dayOffset": 1}, {"end": "02:30", "start": "02:00", "dayOffset": 1}, {"end": "03:00", "start": "02:30", "dayOffset": 1}, {"end": "03:30", "start": "03:00", "dayOffset": 1}, {"end": "04:00", "start": "03:30", "dayOffset": 1}, {"end": "04:30", "start": "04:00", "dayOffset": 1}], "dialers": [{"id": 1, "name": "ACA_Balitech_i5", "color": "#7557de", "campaign": "ACA", "campaign_id": 1}, {"id": 2, "name": "ACA_Balitechi55", "color": "#7557de", "campaign": "ACA", "campaign_id": 1}, {"id": 3, "name": "ACA_Balitech_i6", "color": "#7557de", "campaign": "ACA", "campaign_id": 1}, {"id": 4, "name": "MED_MAIN_BaliTGPT7", "color": "#2a9b8d", "campaign": "MED MAIN", "campaign_id": 2}, {"id": 5, "name": "MED_MAIN_BT1", "color": "#2a9b8d", "campaign": "MED MAIN", "campaign_id": 2}, {"id": 6, "name": "MED_MAIN_BaliMED3", "color": "#2a9b8d", "campaign": "MED MAIN", "campaign_id": 2}, {"id": 7, "name": "MED_BaliMED 5", "color": "#2a9b8d", "campaign": "MED MAIN", "campaign_id": 2}, {"id": 8, "name": "MED_MAIN_BTrev1", "color": "#2a9b8d", "campaign": "MED MAIN", "campaign_id": 2}, {"id": 9, "name": "MED_2.O_Balitechmed 8", "color": "#4d8bd9", "campaign": "MED 2.0", "campaign_id": 3}, {"id": 10, "name": "MED_2.O_BaliMED1", "color": "#4d8bd9", "campaign": "MED 2.0", "campaign_id": 3}, {"id": 11, "name": "MED_2.O_BaliMED2", "color": "#4d8bd9", "campaign": "MED 2.0", "campaign_id": 3}, {"id": 12, "name": "MED_2.O_ACAGPT1s", "color": "#4d8bd9", "campaign": "MED 2.0", "campaign_id": 3}, {"id": 13, "name": "MED_2.O_BaliMED4", "color": "#4d8bd9", "campaign": "MED 2.0", "campaign_id": 3}, {"id": 14, "name": "MED_2.O_BaliMED 6", "color": "#4d8bd9", "campaign": "MED 2.0", "campaign_id": 3}, {"id": 15, "name": "ACA_HI_Balitechi4_i5", "color": "#d99a3d", "campaign": "HI", "campaign_id": 4}, {"id": 16, "name": "CGM_Balitech7.i5-CGM", "color": "#cf6d9a", "campaign": "CGM", "campaign_id": 5}, {"id": 17, "name": "FE_BalitechFE", "color": "#7083cf", "campaign": "FE", "campaign_id": 6}, {"id": 18, "name": "MVA_BalitechISB", "color": "#8b97aa", "campaign": "MVA", "campaign_id": 7}, {"id": 21, "name": "2.7", "color": "#7557de", "campaign": "ACA", "campaign_id": 1}], "currency": "USD", "timezone": "Asia/Karachi"}	3	1	2026-10-21 00:16:47.948027+05	2026-10-21 01:14:10.366391+05
2	Balitech · VoIP report	2026-10-20	{"slots": [{"end": "19:00", "start": "18:30", "dayOffset": 0}, {"end": "19:30", "start": "19:00", "dayOffset": 0}, {"end": "20:00", "start": "19:30", "dayOffset": 0}, {"end": "20:30", "start": "20:00", "dayOffset": 0}, {"end": "21:00", "start": "20:30", "dayOffset": 0}, {"end": "21:30", "start": "21:00", "dayOffset": 0}, {"end": "22:00", "start": "21:30", "dayOffset": 0}, {"end": "22:30", "start": "22:00", "dayOffset": 0}, {"end": "23:00", "start": "22:30", "dayOffset": 0}, {"end": "23:30", "start": "23:00", "dayOffset": 0}, {"end": "00:00", "start": "23:30", "dayOffset": 0}, {"end": "00:30", "start": "00:00", "dayOffset": 1}, {"end": "01:00", "start": "00:30", "dayOffset": 1}, {"end": "01:30", "start": "01:00", "dayOffset": 1}, {"end": "02:00", "start": "01:30", "dayOffset": 1}, {"end": "02:30", "start": "02:00", "dayOffset": 1}, {"end": "03:00", "start": "02:30", "dayOffset": 1}, {"end": "03:30", "start": "03:00", "dayOffset": 1}, {"end": "04:00", "start": "03:30", "dayOffset": 1}, {"end": "04:30", "start": "04:00", "dayOffset": 1}], "dialers": [{"id": 1, "name": "ACA_Balitech_i5", "color": "#7557de", "campaign": "ACA", "deleted_at": null, "campaign_id": 1}, {"id": 2, "name": "ACA_Balitechi55", "color": "#7557de", "campaign": "ACA", "deleted_at": null, "campaign_id": 1}, {"id": 3, "name": "ACA_Balitech_i6", "color": "#7557de", "campaign": "ACA", "deleted_at": null, "campaign_id": 1}, {"id": 19, "name": "2.6", "color": "#7557de", "campaign": "ACA", "deleted_at": null, "campaign_id": 1}, {"id": 21, "name": "2.7", "color": "#7557de", "campaign": "ACA", "deleted_at": null, "campaign_id": 1}, {"id": 4, "name": "MED_MAIN_BaliTGPT7", "color": "#2a9b8d", "campaign": "MED MAIN", "deleted_at": null, "campaign_id": 2}, {"id": 5, "name": "MED_MAIN_BT1", "color": "#2a9b8d", "campaign": "MED MAIN", "deleted_at": null, "campaign_id": 2}, {"id": 6, "name": "MED_MAIN_BaliMED3", "color": "#2a9b8d", "campaign": "MED MAIN", "deleted_at": null, "campaign_id": 2}, {"id": 7, "name": "MED_BaliMED 5", "color": "#2a9b8d", "campaign": "MED MAIN", "deleted_at": null, "campaign_id": 2}, {"id": 8, "name": "MED_MAIN_BTrev1", "color": "#2a9b8d", "campaign": "MED MAIN", "deleted_at": null, "campaign_id": 2}, {"id": 9, "name": "MED_2.O_Balitechmed 8", "color": "#4d8bd9", "campaign": "MED 2.0", "deleted_at": null, "campaign_id": 3}, {"id": 10, "name": "MED_2.O_BaliMED1", "color": "#4d8bd9", "campaign": "MED 2.0", "deleted_at": null, "campaign_id": 3}, {"id": 11, "name": "MED_2.O_BaliMED2", "color": "#4d8bd9", "campaign": "MED 2.0", "deleted_at": null, "campaign_id": 3}, {"id": 12, "name": "MED_2.O_ACAGPT1s", "color": "#4d8bd9", "campaign": "MED 2.0", "deleted_at": null, "campaign_id": 3}, {"id": 13, "name": "MED_2.O_BaliMED4", "color": "#4d8bd9", "campaign": "MED 2.0", "deleted_at": null, "campaign_id": 3}, {"id": 14, "name": "MED_2.O_BaliMED 6", "color": "#4d8bd9", "campaign": "MED 2.0", "deleted_at": null, "campaign_id": 3}, {"id": 15, "name": "ACA_HI_Balitechi4_i5", "color": "#d99a3d", "campaign": "HI", "deleted_at": null, "campaign_id": 4}, {"id": 16, "name": "CGM_Balitech7.i5-CGM", "color": "#cf6d9a", "campaign": "CGM", "deleted_at": null, "campaign_id": 5}, {"id": 17, "name": "FE_BalitechFE", "color": "#7083cf", "campaign": "FE", "deleted_at": null, "campaign_id": 6}, {"id": 18, "name": "MVA_BalitechISB", "color": "#8b97aa", "campaign": "MVA", "deleted_at": null, "campaign_id": 7}], "currency": "USD", "timezone": "America/New_York"}	1	1	2026-10-21 02:01:52.31982+05	2026-10-21 02:02:08.587678+05
3	Balitech · VoIP report	2026-10-20	{"slots": [{"end": "19:00", "start": "18:30", "dayOffset": 0}, {"end": "19:30", "start": "19:00", "dayOffset": 0}, {"end": "20:00", "start": "19:30", "dayOffset": 0}, {"end": "20:30", "start": "20:00", "dayOffset": 0}, {"end": "21:00", "start": "20:30", "dayOffset": 0}, {"end": "21:30", "start": "21:00", "dayOffset": 0}, {"end": "22:00", "start": "21:30", "dayOffset": 0}, {"end": "22:30", "start": "22:00", "dayOffset": 0}, {"end": "23:00", "start": "22:30", "dayOffset": 0}, {"end": "23:30", "start": "23:00", "dayOffset": 0}, {"end": "00:00", "start": "23:30", "dayOffset": 0}, {"end": "00:30", "start": "00:00", "dayOffset": 1}, {"end": "01:00", "start": "00:30", "dayOffset": 1}, {"end": "01:30", "start": "01:00", "dayOffset": 1}, {"end": "02:00", "start": "01:30", "dayOffset": 1}, {"end": "02:30", "start": "02:00", "dayOffset": 1}, {"end": "03:00", "start": "02:30", "dayOffset": 1}, {"end": "03:30", "start": "03:00", "dayOffset": 1}, {"end": "04:00", "start": "03:30", "dayOffset": 1}, {"end": "04:30", "start": "04:00", "dayOffset": 1}], "dialers": [{"id": 1, "name": "ACA_Balitech_i5", "color": "#7557de", "campaign": "ACA", "deleted_at": null, "campaign_id": 1}, {"id": 2, "name": "ACA_Balitechi55", "color": "#7557de", "campaign": "ACA", "deleted_at": null, "campaign_id": 1}, {"id": 3, "name": "ACA_Balitech_i6", "color": "#7557de", "campaign": "ACA", "deleted_at": null, "campaign_id": 1}, {"id": 19, "name": "2.6", "color": "#7557de", "campaign": "ACA", "deleted_at": null, "campaign_id": 1}, {"id": 21, "name": "2.7", "color": "#7557de", "campaign": "ACA", "deleted_at": null, "campaign_id": 1}, {"id": 4, "name": "MED_MAIN_BaliTGPT7", "color": "#2a9b8d", "campaign": "MED MAIN", "deleted_at": null, "campaign_id": 2}, {"id": 5, "name": "MED_MAIN_BT1", "color": "#2a9b8d", "campaign": "MED MAIN", "deleted_at": null, "campaign_id": 2}, {"id": 6, "name": "MED_MAIN_BaliMED3", "color": "#2a9b8d", "campaign": "MED MAIN", "deleted_at": null, "campaign_id": 2}, {"id": 7, "name": "MED_BaliMED 5", "color": "#2a9b8d", "campaign": "MED MAIN", "deleted_at": null, "campaign_id": 2}, {"id": 8, "name": "MED_MAIN_BTrev1", "color": "#2a9b8d", "campaign": "MED MAIN", "deleted_at": null, "campaign_id": 2}, {"id": 9, "name": "MED_2.O_Balitechmed 8", "color": "#4d8bd9", "campaign": "MED 2.0", "deleted_at": null, "campaign_id": 3}, {"id": 10, "name": "MED_2.O_BaliMED1", "color": "#4d8bd9", "campaign": "MED 2.0", "deleted_at": null, "campaign_id": 3}, {"id": 11, "name": "MED_2.O_BaliMED2", "color": "#4d8bd9", "campaign": "MED 2.0", "deleted_at": null, "campaign_id": 3}, {"id": 12, "name": "MED_2.O_ACAGPT1s", "color": "#4d8bd9", "campaign": "MED 2.0", "deleted_at": null, "campaign_id": 3}, {"id": 13, "name": "MED_2.O_BaliMED4", "color": "#4d8bd9", "campaign": "MED 2.0", "deleted_at": null, "campaign_id": 3}, {"id": 14, "name": "MED_2.O_BaliMED 6", "color": "#4d8bd9", "campaign": "MED 2.0", "deleted_at": null, "campaign_id": 3}, {"id": 15, "name": "ACA_HI_Balitechi4_i5", "color": "#d99a3d", "campaign": "HI", "deleted_at": null, "campaign_id": 4}, {"id": 16, "name": "CGM_Balitech7.i5-CGM", "color": "#cf6d9a", "campaign": "CGM", "deleted_at": null, "campaign_id": 5}, {"id": 17, "name": "FE_BalitechFE", "color": "#7083cf", "campaign": "FE", "deleted_at": null, "campaign_id": 6}], "currency": "USD", "timezone": "America/New_York"}	0	3	2026-10-21 02:45:51.298235+05	2026-10-21 02:45:51.298235+05
\.


--
-- Data for Name: user_audit; Type: TABLE DATA; Schema: voip; Owner: postgres
--

COPY voip.user_audit (id, user_id, action, detail, created_at) FROM stdin;
1	1	User created	{"name": "Operations Admin", "role": "admin", "email": "operations.admin@goconnectivo.local"}	2026-10-21 02:16:47.350384+05
2	1	User created	{"name": "Waqas Bali", "role": "admin", "email": "waqasbali@gmail.com"}	2026-10-21 02:34:08.422602+05
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: voip; Owner: postgres
--

COPY voip.users (id, name, email, password_hash, created_at, role, deleted_at, version) FROM stdin;
1	Muhammad Shabbir Ahmed	shabbirahmed.devv@gmail.com	$2b$12$C5FYWvtmOYwgCymFRj1LseCL2qBaU77YEvpZh2MmXVjhd0sKjV3vm	2026-10-21 00:16:14.258564+05	super_admin	\N	0
2	Operations Admin	operations.admin@goconnectivo.local	$2b$12$jns.w8iWy2Illex6Hrw.neiDrLoIpC/f.tBtzXMHxM41P4mtBb8S2	2026-10-21 02:16:47.350384+05	admin	\N	0
3	Waqas Bali	waqasbali@gmail.com	$2b$12$YbBgpK6akH4TgEifjxUuMeRJGwpx9ia5FC0XL.ZhRE7J0LvdbTmgy	2026-10-21 02:34:08.422602+05	admin	\N	0
\.


--
-- Data for Name: vendor_audit; Type: TABLE DATA; Schema: voip; Owner: postgres
--

COPY voip.vendor_audit (id, report_id, user_id, action, detail, created_at) FROM stdin;
1	1	1	Vendor report created	{"name": "Vendor night shift"}	2026-10-21 01:45:32.79709+05
2	1	1	Vendor entries saved	{"count": 2, "changes": [{"slot": 0, "amount": 70, "previous": null, "vendor_id": 1}, {"slot": 1, "amount": 0, "previous": null, "vendor_id": 1}]}	2026-10-21 01:57:53.406361+05
\.


--
-- Data for Name: vendor_reports; Type: TABLE DATA; Schema: voip; Owner: postgres
--

COPY voip.vendor_reports (id, name, report_date, config, entries, version, created_by, created_at, updated_at) FROM stdin;
1	Vendor night shift	2026-10-20	{"slots": [{"end": "19:00", "start": "18:00", "dayOffset": 0}, {"end": "20:00", "start": "19:00", "dayOffset": 0}, {"end": "21:00", "start": "20:00", "dayOffset": 0}, {"end": "22:00", "start": "21:00", "dayOffset": 0}, {"end": "23:00", "start": "22:00", "dayOffset": 0}, {"end": "00:00", "start": "23:00", "dayOffset": 0}, {"end": "01:00", "start": "00:00", "dayOffset": 1}, {"end": "02:00", "start": "01:00", "dayOffset": 1}, {"end": "03:00", "start": "02:00", "dayOffset": 1}, {"end": "04:00", "start": "03:00", "dayOffset": 1}], "vendors": [{"id": 1, "name": "Telcast_com"}, {"id": 2, "name": "Telcast_main"}, {"id": 3, "name": "Dial_egde"}, {"id": 4, "name": "Dial_360"}, {"id": 5, "name": "Go_Connectivo"}, {"id": 6, "name": "Contactivity_main"}, {"id": 7, "name": "Contactivity_com"}], "timezone": "America/New_York", "removedVendors": []}	[{"slot": 0, "amount": 70, "vendor_id": 1}, {"slot": 1, "amount": 0, "vendor_id": 1}]	1	1	2026-10-21 01:45:32.79709+05	2026-10-21 01:57:53.406361+05
\.


--
-- Data for Name: vendors; Type: TABLE DATA; Schema: voip; Owner: postgres
--

COPY voip.vendors (id, name, deleted_at) FROM stdin;
1	Telcast_com	\N
2	Telcast_main	\N
3	Dial_egde	\N
4	Dial_360	\N
5	Go_Connectivo	\N
6	Contactivity_main	\N
7	Contactivity_com	\N
\.


--
-- Name: audit_id_seq; Type: SEQUENCE SET; Schema: voip; Owner: postgres
--

SELECT pg_catalog.setval('voip.audit_id_seq', 4, true);


--
-- Name: campaigns_id_seq; Type: SEQUENCE SET; Schema: voip; Owner: postgres
--

SELECT pg_catalog.setval('voip.campaigns_id_seq', 7, true);


--
-- Name: dialers_id_seq; Type: SEQUENCE SET; Schema: voip; Owner: postgres
--

SELECT pg_catalog.setval('voip.dialers_id_seq', 21, true);


--
-- Name: sheets_id_seq; Type: SEQUENCE SET; Schema: voip; Owner: postgres
--

SELECT pg_catalog.setval('voip.sheets_id_seq', 3, true);


--
-- Name: user_audit_id_seq; Type: SEQUENCE SET; Schema: voip; Owner: postgres
--

SELECT pg_catalog.setval('voip.user_audit_id_seq', 2, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: voip; Owner: postgres
--

SELECT pg_catalog.setval('voip.users_id_seq', 3, true);


--
-- Name: vendor_audit_id_seq; Type: SEQUENCE SET; Schema: voip; Owner: postgres
--

SELECT pg_catalog.setval('voip.vendor_audit_id_seq', 2, true);


--
-- Name: vendor_reports_id_seq; Type: SEQUENCE SET; Schema: voip; Owner: postgres
--

SELECT pg_catalog.setval('voip.vendor_reports_id_seq', 1, true);


--
-- Name: vendors_id_seq; Type: SEQUENCE SET; Schema: voip; Owner: postgres
--

SELECT pg_catalog.setval('voip.vendors_id_seq', 7, true);


--
-- Name: audit audit_pkey; Type: CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.audit
    ADD CONSTRAINT audit_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_name_key; Type: CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.campaigns
    ADD CONSTRAINT campaigns_name_key UNIQUE (name);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: dialers dialers_name_key; Type: CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.dialers
    ADD CONSTRAINT dialers_name_key UNIQUE (name);


--
-- Name: dialers dialers_pkey; Type: CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.dialers
    ADD CONSTRAINT dialers_pkey PRIMARY KEY (id);


--
-- Name: entries entries_pkey; Type: CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.entries
    ADD CONSTRAINT entries_pkey PRIMARY KEY (sheet_id, dialer_id, slot);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (name);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (token_hash);


--
-- Name: sheets sheets_pkey; Type: CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.sheets
    ADD CONSTRAINT sheets_pkey PRIMARY KEY (id);


--
-- Name: user_audit user_audit_pkey; Type: CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.user_audit
    ADD CONSTRAINT user_audit_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vendor_audit vendor_audit_pkey; Type: CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.vendor_audit
    ADD CONSTRAINT vendor_audit_pkey PRIMARY KEY (id);


--
-- Name: vendor_reports vendor_reports_pkey; Type: CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.vendor_reports
    ADD CONSTRAINT vendor_reports_pkey PRIMARY KEY (id);


--
-- Name: vendors vendors_name_key; Type: CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.vendors
    ADD CONSTRAINT vendors_name_key UNIQUE (name);


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- Name: sheets_owner_date_idx; Type: INDEX; Schema: voip; Owner: postgres
--

CREATE INDEX sheets_owner_date_idx ON voip.sheets USING btree (created_by, report_date);


--
-- Name: vendor_reports_date_idx; Type: INDEX; Schema: voip; Owner: postgres
--

CREATE INDEX vendor_reports_date_idx ON voip.vendor_reports USING btree (report_date);


--
-- Name: vendor_reports_owner_date_idx; Type: INDEX; Schema: voip; Owner: postgres
--

CREATE INDEX vendor_reports_owner_date_idx ON voip.vendor_reports USING btree (created_by, report_date);


--
-- Name: audit audit_sheet_id_fkey; Type: FK CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.audit
    ADD CONSTRAINT audit_sheet_id_fkey FOREIGN KEY (sheet_id) REFERENCES voip.sheets(id) ON DELETE CASCADE;


--
-- Name: audit audit_user_id_fkey; Type: FK CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.audit
    ADD CONSTRAINT audit_user_id_fkey FOREIGN KEY (user_id) REFERENCES voip.users(id);


--
-- Name: dialers dialers_campaign_id_fkey; Type: FK CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.dialers
    ADD CONSTRAINT dialers_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES voip.campaigns(id);


--
-- Name: entries entries_sheet_id_fkey; Type: FK CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.entries
    ADD CONSTRAINT entries_sheet_id_fkey FOREIGN KEY (sheet_id) REFERENCES voip.sheets(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES voip.users(id);


--
-- Name: sheets sheets_created_by_fkey; Type: FK CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.sheets
    ADD CONSTRAINT sheets_created_by_fkey FOREIGN KEY (created_by) REFERENCES voip.users(id);


--
-- Name: user_audit user_audit_user_id_fkey; Type: FK CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.user_audit
    ADD CONSTRAINT user_audit_user_id_fkey FOREIGN KEY (user_id) REFERENCES voip.users(id);


--
-- Name: vendor_audit vendor_audit_report_id_fkey; Type: FK CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.vendor_audit
    ADD CONSTRAINT vendor_audit_report_id_fkey FOREIGN KEY (report_id) REFERENCES voip.vendor_reports(id);


--
-- Name: vendor_audit vendor_audit_user_id_fkey; Type: FK CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.vendor_audit
    ADD CONSTRAINT vendor_audit_user_id_fkey FOREIGN KEY (user_id) REFERENCES voip.users(id);


--
-- Name: vendor_reports vendor_reports_created_by_fkey; Type: FK CONSTRAINT; Schema: voip; Owner: postgres
--

ALTER TABLE ONLY voip.vendor_reports
    ADD CONSTRAINT vendor_reports_created_by_fkey FOREIGN KEY (created_by) REFERENCES voip.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict c8dA6J3fHu1kecX2oZVYPApGNnhrCbABdg9THNoYiKNpP4c7GTTtdCbgjoHelgL

