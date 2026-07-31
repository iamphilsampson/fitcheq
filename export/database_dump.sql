--
-- PostgreSQL database dump
--

\restrict g0H4gJdc2ayMQGaHAcnW0ZNuCitnOhm1Eeb6tjPdhBu976nisapib21ujSCO2Jh

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_log (
    id integer NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id integer NOT NULL,
    description text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    user_id text
);


--
-- Name: activity_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.activity_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: activity_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.activity_log_id_seq OWNED BY public.activity_log.id;


--
-- Name: items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.items (
    id integer NOT NULL,
    category text NOT NULL,
    sub_category text,
    brand text,
    size text,
    color text,
    image_url text,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    user_id text
);


--
-- Name: items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.items_id_seq OWNED BY public.items.id;


--
-- Name: outfit_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outfit_items (
    id integer NOT NULL,
    outfit_id integer NOT NULL,
    item_id integer NOT NULL
);


--
-- Name: outfit_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.outfit_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: outfit_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.outfit_items_id_seq OWNED BY public.outfit_items.id;


--
-- Name: outfits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outfits (
    id integer NOT NULL,
    date_worn date NOT NULL,
    full_image_url text NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    user_id text,
    original_image_url text
);


--
-- Name: outfits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.outfits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: outfits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.outfits_id_seq OWNED BY public.outfits.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    sid character varying NOT NULL,
    sess jsonb NOT NULL,
    expire timestamp without time zone NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    username text,
    password text,
    email character varying,
    first_name character varying,
    last_name character varying,
    profile_image_url character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: activity_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log ALTER COLUMN id SET DEFAULT nextval('public.activity_log_id_seq'::regclass);


--
-- Name: items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items ALTER COLUMN id SET DEFAULT nextval('public.items_id_seq'::regclass);


--
-- Name: outfit_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outfit_items ALTER COLUMN id SET DEFAULT nextval('public.outfit_items_id_seq'::regclass);


--
-- Name: outfits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outfits ALTER COLUMN id SET DEFAULT nextval('public.outfits_id_seq'::regclass);


--
-- Data for Name: activity_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.activity_log (id, action, entity_type, entity_id, description, created_at, user_id) FROM stdin;
1	deleted	outfit	5	Outfit from 2026-03-26	2026-03-26 22:52:05.830407	103113185755418009684
34	created	outfit	38	Outfit from 2026-03-24	2026-03-28 10:12:07.298084	103113185755418009684
35	created	item	22	Stripey Shirt (Long) Uniqlo	2026-03-30 16:41:24.350221	103113185755418009684
36	created	item	23	Stone Overshirt Uniqlo	2026-03-30 16:41:24.500638	103113185755418009684
37	created	item	24	Stripey Shirt (Long) Uniqlo	2026-03-30 16:41:29.597125	103113185755418009684
38	created	item	25	Stone Overshirt Uniqlo	2026-03-30 16:41:29.7495	103113185755418009684
\.


--
-- Data for Name: items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.items (id, category, sub_category, brand, size, color, image_url, description, created_at, user_id) FROM stdin;
1	Tops	T-Shirt	Nike	M	Black	\N	\N	2026-01-24 12:45:58.43002	103113185755418009684
2	Tops	T-Shirt	\N	\N	Black	\N	Black T-Shirt	2026-03-08 17:57:37.639059	103113185755418009684
4	Tops	T-Shirt	Nike	\N	Black	\N	Black T-Shirt	2026-03-08 18:18:28.888988	103113185755418009684
6	Tops	Long Sleeve	Beams	\N	Black	\N	Black Long Sleeve	2026-03-08 18:23:30.564366	103113185755418009684
7	Outerwear	Coat	Carhartt	\N	Yellow	\N	Yellow Coat	2026-03-08 18:23:30.715985	103113185755418009684
8	Bottoms	Trousers	Ben Davis	\N	Black	\N	Black Trousers	2026-03-08 18:23:30.837805	103113185755418009684
9	Footwear	Trainers	Nike	\N	Blue	\N	Blue Trainers	2026-03-08 18:23:31.009842	103113185755418009684
10	Accessories	Hat	Raised by Wolves	\N	Tartan	\N	Tartan Hat	2026-03-08 18:23:31.128643	103113185755418009684
11	Tops	Long Sleeve	Carhartt	\N	White	\N	White Long Sleeve	2026-03-08 18:35:15.680926	103113185755418009684
12	Outerwear	Coat	Olaf	\N	Blue	\N	Blue Coat	2026-03-08 18:35:15.93606	103113185755418009684
13	Bottoms	Trousers	Uniqlo	\N	White	\N	White Trousers	2026-03-08 18:35:16.057631	103113185755418009684
14	Footwear	Wallabee	Clarks	\N	Brown	\N	Brown Wallabee	2026-03-08 18:35:16.172956	103113185755418009684
15	Accessories	Hat	Carhartt	\N	Black	\N	Black Hat	2026-03-08 18:35:16.294408	103113185755418009684
16	Tops	T-Shirt	Frith Street	\N	White	\N	White T-Shirt	2026-03-08 18:52:44.78276	103113185755418009684
17	Tops	Shirt (Short)	Fred Perry	\N	Blue	\N	Blue Shirt (Short)	2026-03-08 18:52:45.167191	103113185755418009684
18	Outerwear	Coat	CP	\N	Blue	\N	Blue Coat	2026-03-08 18:52:45.288558	103113185755418009684
19	Bottoms	Jeans	Beams	\N	Blue	\N	Blue Jeans	2026-03-08 18:52:45.409976	103113185755418009684
20	Footwear	Wallabee	Clarks	\N	Blue	\N	Blue Wallabee	2026-03-08 18:52:45.538202	103113185755418009684
21	Accessories	Belt	LV	\N	Brown	\N	Brown Belt	2026-03-08 18:52:45.672799	103113185755418009684
22	Tops	Shirt (Long)	Uniqlo	\N	Stripey	\N	Stripey Shirt (Long)	2026-03-30 16:41:24.345492	103113185755418009684
23	Outerwear	Overshirt	Uniqlo	\N	Stone	\N	Stone Overshirt	2026-03-30 16:41:24.497244	103113185755418009684
24	Tops	Shirt (Long)	Uniqlo	\N	Stripey	\N	Stripey Shirt (Long)	2026-03-30 16:41:29.592874	103113185755418009684
25	Outerwear	Overshirt	Uniqlo	\N	Stone	\N	Stone Overshirt	2026-03-30 16:41:29.746858	103113185755418009684
\.


--
-- Data for Name: outfit_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.outfit_items (id, outfit_id, item_id) FROM stdin;
15	3	16
16	3	17
17	3	18
18	3	19
19	3	20
20	3	21
54	2	11
55	2	12
56	2	13
57	2	14
58	2	15
\.


--
-- Data for Name: outfits; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.outfits (id, date_worn, full_image_url, notes, created_at, user_id, original_image_url) FROM stdin;
1	2026-01-24	/objects/uploads/c62c03e6-8d98-4513-bf0b-da00720fb8c4	\N	2026-01-24 18:09:50.945748	103113185755418009684	\N
2	2026-02-25	/objects/uploads/61b1b150-15a0-4205-9cb9-ddc749a0f42a	\N	2026-02-25 17:46:10.134332	103113185755418009684	\N
3	2026-02-17	/objects/uploads/62cc2638-13e0-40d6-8b35-d1d2e2309535	\N	2026-02-25 18:03:31.159686	103113185755418009684	\N
38	2026-03-24	/objects/uploads/4bb8a8b5-6cf2-495c-a106-40a9868ee5b0	\N	2026-03-28 10:12:06.94373	103113185755418009684	\N
4	2026-03-05	/objects/uploads/408d2781-25d3-4777-9dba-31c5631b8581	\N	2026-03-08 17:34:48.078455	103113185755418009684	\N
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, username, password, email, first_name, last_name, profile_image_url, created_at, updated_at) FROM stdin;
103113185755418009684	\N	\N	iamphilsampson@gmail.com	Phil	Sampson	https://lh3.googleusercontent.com/a/ACg8ocJm4un3etDbuUWZYWAYpxbTUxLnm3E7G0zXwSWTwywr86l37AKaoA=s96-c	2026-03-30 16:39:14.120616	2026-04-23 20:39:22.41
\.


--
-- Name: activity_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.activity_log_id_seq', 38, true);


--
-- Name: items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.items_id_seq', 25, true);


--
-- Name: outfit_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.outfit_items_id_seq', 58, true);


--
-- Name: outfits_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.outfits_id_seq', 38, true);


--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- Name: items items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);


--
-- Name: outfit_items outfit_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outfit_items
    ADD CONSTRAINT outfit_items_pkey PRIMARY KEY (id);


--
-- Name: outfits outfits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outfits
    ADD CONSTRAINT outfits_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (sid);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_session_expire" ON public.sessions USING btree (expire);


--
-- Name: outfit_items outfit_items_item_id_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outfit_items
    ADD CONSTRAINT outfit_items_item_id_items_id_fk FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: outfit_items outfit_items_outfit_id_outfits_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outfit_items
    ADD CONSTRAINT outfit_items_outfit_id_outfits_id_fk FOREIGN KEY (outfit_id) REFERENCES public.outfits(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict g0H4gJdc2ayMQGaHAcnW0ZNuCitnOhm1Eeb6tjPdhBu976nisapib21ujSCO2Jh

