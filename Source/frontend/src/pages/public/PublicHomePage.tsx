import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { IllustrationLabel, RoomSearch, SectionHeading } from '../../components'
import type { RoomSearchValues } from '../../components'
import { usePublicContact } from '../../features/auth/usePublicContact'
import { listFeaturedRooms, listPublicLocations, publicQueryKeys } from '../../features/public/api'
import type { PublicLocation } from '../../features/public/api'
import { ListState } from '../../features/public/ListState'
import { RoomCard } from '../../features/public/RoomCard'
import { EntryScreen } from '../../features/public/EntryScreen'
import { formatMoney } from '../../shared/formatters'
import { useI18n } from '../../shared/i18n'
import '../../features/public/home-lower.css'

const reasons = [
  { number: '01', title: 'home.reasons.1.title', body: 'home.reasons.1.body', note: 'home.reasons.1.note' },
  { number: '02', title: 'home.reasons.2.title', body: 'home.reasons.2.body', note: 'home.reasons.2.note' },
  { number: '03', title: 'home.reasons.3.title', body: 'home.reasons.3.body', note: 'home.reasons.3.note' },
  { number: '04', title: 'home.reasons.4.title', body: 'home.reasons.4.body', note: 'home.reasons.4.note' },
] as const

const steps = [
  { number: '01', title: 'home.steps.1.title', body: 'home.steps.1.body' },
  { number: '02', title: 'home.steps.2.title', body: 'home.steps.2.body' },
  { number: '03', title: 'home.steps.3.title', body: 'home.steps.3.body' },
] as const

const districtImages: Record<string, string> = {
  'Đống Đa': '/images/area-lang-ha.webp',
  'Ba Đình': '/images/area-ba-dinh.webp',
  'Cầu Giấy': '/images/area-cau-giay.webp',
}

function roomsSearch({ district, maxPrice }: RoomSearchValues): string {
  const params = new URLSearchParams()
  if (district) params.set('district', district)
  if (maxPrice === '5000000+') params.set('minPrice', '5000000')
  else if (maxPrice) params.set('maxPrice', maxPrice)
  return params.toString()
}

function districtHref(district: string) {
  return { pathname: '/phong', search: new URLSearchParams({ district }).toString() }
}

function DistrictCard({ item }: { item: PublicLocation }) {
  const { t } = useI18n()
  const image = districtImages[item.district]
  return <Link className="public-district" to={districtHref(item.district)}>
    <span className={`public-district-media${image ? '' : ' public-district-media--empty'}`}>
      {image
        ? <><img src={image} alt={t('home.district.imageAlt', { district: item.district })} /><IllustrationLabel>{t('home.illustration')}</IllustrationLabel></>
        : <span>{t('home.district.noImage')}</span>}
    </span>
    <span className="public-district-copy">
      <span className="rooms-eyebrow">{t('home.district.availableCount', { count: item.roomCount })}</span>
      <strong>{item.district}</strong>
      <span>{t('home.district.view')} <span aria-hidden="true">→</span></span>
    </span>
  </Link>
}

export function PublicHomePage() {
  const { lang, t } = useI18n()
  const navigate = useNavigate()
  const budgets = [2_000_000, 3_000_000, 4_000_000, 5_000_000].map(value => ({ value: String(value), label: t('home.budget.upTo', { amount: formatMoney(value) }) }))
  budgets.push({ value: '5000000+', label: t('home.budget.from', { amount: formatMoney(5_000_000) }) })
  const featured = useQuery({ queryKey: [...publicQueryKeys.featured, lang], queryFn: listFeaturedRooms })
  const locations = useQuery({ queryKey: [...publicQueryKeys.locations, lang], queryFn: listPublicLocations })
  const contact = usePublicContact()
  const availableRoomCount = locations.data?.reduce((sum, item) => sum + item.roomCount, 0)
  const districtCount = locations.data?.length
  const wardCount = locations.data?.reduce((sum, item) => sum + item.wards.length, 0)
  const statValue = (value: number | undefined) => locations.isError ? '—' : value ?? '…'
  const phone = contact.data?.phone || null
  const zalo = contact.data?.zaloUrl?.startsWith('https://') ? contact.data.zaloUrl : null

  return <>
    <EntryScreen />
    <section className="public-hero" aria-labelledby="public-home-title">
      <div className="public-hero-copy">
        <p className="rooms-eyebrow">{t('home.hero.eyebrow')}</p>
        <h1 id="public-home-title">{t('home.hero.leading')}<em>{t('home.hero.highlight')}</em>{t('home.hero.trailing')}</h1>
        <p className="public-hero-intro">{t('home.hero.intro')}</p>
        <Link className="public-hero-link" to="/phong">{t('home.findVacant')} <span aria-hidden="true">→</span></Link>
        <dl className="public-hero-stats" aria-label={t('home.stats.label')}>
          <div><dt>{statValue(availableRoomCount)}</dt><dd>{t('home.stats.rooms')}</dd></div>
          <div><dt>{statValue(districtCount)}</dt><dd>{t('home.stats.districts')}</dd></div>
          <div><dt>{statValue(wardCount)}</dt><dd>{t('home.stats.wards')}</dd></div>
        </dl>
      </div>
      <div className="public-hero-visual">
        <img className="public-hero-image" src="/images/hero-building.webp" alt={t('home.hero.imageAlt')} />
        <IllustrationLabel>{t('home.illustration')}</IllustrationLabel>
        <div className="public-hero-availability" aria-live="polite">
          <span aria-hidden="true" />
          <p><strong>{availableRoomCount === undefined ? t('home.hero.updating') : t('home.hero.available', { count: availableRoomCount })}</strong><small>{t('home.hero.source')}</small></p>
        </div>
      </div>
    </section>

    <div className="public-search">
      <RoomSearch districts={locations.data?.map(item => item.district) ?? []} budgets={budgets}
        districtLabel={t('home.search.district')} budgetLabel={t('home.search.budget')} submitLabel={t('home.search.submit')}
        allDistrictsLabel={t('home.search.allDistricts')} allBudgetsLabel={t('home.search.allBudgets')}
        onSearch={values => navigate({ pathname: '/phong', search: roomsSearch(values) })} />
    </div>

    <section className="public-lower-section public-reasons" aria-labelledby="public-reasons-title">
      <div className="public-centered-heading">
        <p className="rooms-eyebrow">{t('home.reasons.eyebrow')}</p>
        <h2 id="public-reasons-title">{t('home.reasons.title')}</h2>
        <p>{t('home.reasons.intro')}</p>
      </div>
      <div className="public-reason-grid">
        {reasons.map(reason => <article className="public-reason-card" key={reason.number}>
          <span className="public-card-number" aria-hidden="true">{reason.number}</span>
          <h3>{t(reason.title)}</h3><p>{t(reason.body)}</p><small>{t(reason.note)}</small>
        </article>)}
      </div>
    </section>

    <section className="public-section public-featured" aria-label={t('home.featured.label')}>
      <SectionHeading eyebrow={t('home.featured.eyebrow')} description={t('home.featured.description')}>{t('home.featured.label')}</SectionHeading>
      <p className="public-section-link"><Link to="/phong">{t('home.featured.all')}</Link></p>
      <ListState status={featured.status} error={featured.error} isEmpty={!featured.data?.length}
        loadingLabel={t('rooms.list.loading')} emptyTitle={t('rooms.list.noVacancy')}
        emptyHint={<Link to="/phong">{t('home.featured.all')}</Link>} onRetry={() => void featured.refetch()}>
        <div className="public-grid">
          {featured.data?.map(room => <RoomCard key={room.id} room={room} ctaLabel={t('home.featured.viewing')} />)}
        </div>
      </ListState>
    </section>

    <section id="khu-vuc" className="public-section public-areas" aria-label={t('home.areas.label')}>
      <SectionHeading eyebrow={t('home.areas.eyebrow')} description={t('home.areas.description')}>{t('home.areas.title')}</SectionHeading>
      <ListState status={locations.status} error={locations.error} isEmpty={!locations.data?.length}
        loadingLabel={t('rooms.list.loading')} emptyTitle={t('rooms.list.noVacancy')}
        emptyHint={<Link to="/phong">{t('home.featured.all')}</Link>} onRetry={() => void locations.refetch()}>
        <div className="public-districts">{locations.data?.map(item => <DistrictCard key={item.district} item={item} />)}</div>
      </ListState>
    </section>

    <section className="public-lower-section public-process" aria-labelledby="public-process-title">
      <div className="public-centered-heading">
        <p className="rooms-eyebrow">{t('home.process.eyebrow')}</p>
        <h2 id="public-process-title">{t('home.process.title')}</h2>
        <p>{t('home.process.intro')}</p>
      </div>
      <ol className="public-step-grid">
        {steps.map(step => <li key={step.number}><span>{step.number}</span><h3>{t(step.title)}</h3><p>{t(step.body)}</p></li>)}
      </ol>
    </section>

    <section id="dat-lich" className="public-contact-cta" aria-labelledby="public-contact-title">
      <div>
        <p className="rooms-eyebrow">{t('home.contact.eyebrow')}</p>
        <h2 id="public-contact-title">{t('home.contact.title')}</h2>
        <p>{t('home.contact.intro')}</p>
        <div className="public-contact-lines" aria-live="polite">
          {contact.isPending && <span role="status">{t('home.contact.loading')}</span>}
          {contact.isError && <span role="alert">{t('home.contact.error')} <button type="button" onClick={() => void contact.refetch()}>{t('common.retry')}</button></span>}
          {contact.isSuccess && !phone && !zalo && <span>{t('home.contact.empty')}</span>}
          {phone && <a href={`tel:${phone}`}>{t('home.contact.call', { phone })}</a>}
          {zalo && <a href={zalo} target="_blank" rel="noopener noreferrer">{t('home.contact.zalo')}</a>}
        </div>
      </div>
      <div className="public-contact-action">
        <p className="rooms-eyebrow">{t('home.contact.viewing')}</p>
        <p>{t('home.contact.filterHint')}</p>
        <Link to="/phong">{t('home.findVacant')} <span aria-hidden="true">→</span></Link>
      </div>
    </section>
  </>
}
