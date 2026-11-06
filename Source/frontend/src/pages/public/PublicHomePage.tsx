import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { RoomSearch, SectionHeading } from '../../components'
import type { RoomSearchValues } from '../../components'
import { listFeaturedRooms, listPublicLocations, publicQueryKeys } from '../../features/public/api'
import { ListState } from '../../features/public/ListState'
import { RoomCard } from '../../features/public/RoomCard'

// D-2: the budget ceiling values; '5000000+' has no upper bound, so it sends minPrice only (A-8).
const budgets = [
  { value: '2000000', label: 'Đến 2.000.000 đ' },
  { value: '3000000', label: 'Đến 3.000.000 đ' },
  { value: '4000000', label: 'Đến 4.000.000 đ' },
  { value: '5000000', label: 'Đến 5.000.000 đ' },
  { value: '5000000+', label: 'Trên 5.000.000 đ' },
]

function roomsSearch({ district, maxPrice }: RoomSearchValues): string {
  const params = new URLSearchParams()
  if (district) params.set('district', district)
  if (maxPrice === '5000000+') params.set('minPrice', '5000000')
  else if (maxPrice) params.set('maxPrice', maxPrice)
  return params.toString()
}

export function PublicHomePage() {
  const navigate = useNavigate()
  const featured = useQuery({ queryKey: publicQueryKeys.featured, queryFn: listFeaturedRooms })
  const locations = useQuery({ queryKey: publicQueryKeys.locations, queryFn: listPublicLocations })

  return <>
    <section className="public-hero">
      <div>
        <p className="rooms-eyebrow">Một nhịp sống riêng · Hà Nội</p>
        <h1>Chọn chỗ ở.<br /><em>Bắt đầu an yên.</em></h1>
        <p>Phòng thuê theo tháng, chi phí rõ ràng.<br />Tìm một không gian vừa với cuộc sống của bạn.</p>
        <Link className="public-hero-link" to="/phong">Khám phá phòng trống <span aria-hidden="true">↗</span></Link>
      </div>
      <img className="public-hero-image" src="/images/rooms-hanoi-exterior.webp" alt="Ảnh minh họa" />
    </section>

    <div className="public-search">
      <RoomSearch
        districts={locations.data?.map(item => item.district) ?? []}
        budgets={budgets}
        onSearch={values => navigate({ pathname: '/phong', search: roomsSearch(values) })}
      />
    </div>

    <section className="public-section" aria-label="Phòng nổi bật">
      <SectionHeading eyebrow="Những lựa chọn mới" description="Những phòng trống có giá vừa được duyệt gần đây.">Một nơi để <em>thuộc về.</em></SectionHeading>
      <p className="public-section-link"><Link to="/phong">Xem tất cả phòng trống</Link></p>
      <ListState
        status={featured.status}
        error={featured.error}
        isEmpty={!featured.data?.length}
        loadingLabel="Đang tải danh sách phòng"
        emptyTitle="Chưa có phòng trống nào"
        emptyHint={<Link to="/phong">Xem tất cả phòng trống</Link>}
        onRetry={() => void featured.refetch()}
      >
        <div className="public-grid">
          {featured.data?.map(room => <RoomCard key={room.id} room={room} />)}
        </div>
      </ListState>
    </section>

    <section className="public-section" aria-label="Khu vực">
      <SectionHeading eyebrow="Gần hơn với nhịp sống của bạn">Bạn muốn ở <em>khu vực nào?</em></SectionHeading>
      <ListState
        status={locations.status}
        error={locations.error}
        isEmpty={!locations.data?.length}
        loadingLabel="Đang tải danh sách phòng"
        emptyTitle="Chưa có phòng trống nào"
        emptyHint={<Link to="/phong">Xem tất cả phòng trống</Link>}
        onRetry={() => void locations.refetch()}
      >
        <div className="public-districts">
          {locations.data?.map(item => <Link key={item.district} className="public-district"
            to={{ pathname: '/phong', search: new URLSearchParams({ district: item.district }).toString() }}>
            <span className="rooms-eyebrow">{item.roomCount} phòng trống</span>
            <h3>{item.district}</h3>
          </Link>)}
        </div>
      </ListState>
    </section>
  </>
}
