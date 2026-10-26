import type { SceneBuilding, SceneRoom } from './building-scene'

// Sample data only (KIT-04), shared by the 3D picker and the page sections so every number agrees.
// The real page reads GET /public/buildings/:id, /public/rooms and /public/locations (BLD-04, ROOM-05); prices and
// estimates come from the API (UI-06), they are generated here only to fill the mockup.
// Photos are the AI-generated illustrations of the sibling draft 2026-10-26-hanoi-room-layouts (not real rooms or streets).
const IMG = '/artifact_FE/2026-10-26-hanoi-room-layouts/image_mockup/'
const roomPhotos = [IMG + '03-studio-lang-ha.png', IMG + '04-one-bedroom-indochine.png', IMG + '05-duplex-loft.png']

export type RoomCard = { title: string; specs: [string, string][]; chips: string[] }
export type Room = SceneRoom & { code: string; area: number; occupants: number; price: number; estimate: number; furniture: string[]; image: string; side: string; card: RoomCard }
export type Building = Omit<SceneBuilding, 'rooms'> & { name: string; district: string; ward: string; facade: string; areaTitle: string; description: string; image: string; rooms: Room[] }

const furniture = [['Giường đôi', 'Bếp riêng', 'Điều hòa'], ['Bàn làm việc', 'Tủ lạnh', 'Điều hòa'], ['Ban công', 'Máy giặt', 'Giường đôi']]
const kinds = ['Studio', 'Studio khép kín', '1 phòng ngủ', '1 phòng ngủ + khách'] // by area 22, 26, 30, 34 m²

function sampleRooms(buildingId: string, cols: number, floors: number, featured: Record<string, Partial<Room>> = {}): Room[] {
  const rooms: Room[] = []
  for (let floor = 2; floor <= floors; floor++) {
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < cols; col++) {
        const n = row * cols + col + 1
        const code = `${floor}${String(n).padStart(2, '0')}`
        const area = 22 + ((floor + n) % 4) * 4
        const price = 3200000 + area * 80000 + floor * 50000
        const items = furniture[(floor + n) % 3]
        const kind = kinds[(area - 22) / 4]
        const occupants = area >= 30 ? 3 : 2
        rooms.push({
          id: `${buildingId}-${code}`, code, floor, row, col,
          available: (floor * 7 + n * 3 + cols) % 10 < 3, area, occupants, price, estimate: price + 450000,
          furniture: items, image: roomPhotos[(floor + n) % 3], side: row === 0 ? 'Mặt trước, có ban công' : 'Mặt sau, cửa sổ',
          card: { title: `${kind} tầng ${floor}`, specs: [['Diện tích', `${area} m²`], ['Loại phòng', kind], ['Tối đa', `${occupants} người`]], chips: items },
          ...featured[`${buildingId}-${code}`],
        })
      }
    }
  }
  return rooms
}

// The three rooms shown on the reference design's room list, with their own wording.
const studio: Partial<Room> = {
  available: true, area: 35, occupants: 2, price: 5800000, estimate: 6250000, image: roomPhotos[0], furniture: ['Ban công riêng', 'Máy giặt riêng', 'Bếp từ + hút mùi'],
  card: { title: 'Studio Signature Ban Công Thoáng', specs: [['Diện tích', '35 m²'], ['Loại phòng', 'Studio khép kín'], ['Hướng đón nắng', 'Đông Nam']], chips: ['Ban công riêng', 'Máy giặt riêng', 'Bếp từ + hút mùi'] },
}
const oneBedroom: Partial<Room> = {
  available: true, area: 45, occupants: 3, price: 7200000, estimate: 7650000, image: roomPhotos[1], furniture: ['Sofa văng lớn', 'Bồn tắm đứng kính', 'Bàn làm việc WFH'],
  card: { title: 'Căn Hộ 1PN1K Indochine Ấm Cúng', specs: [['Diện tích', '45 m²'], ['Loại phòng', '1 phòng ngủ + khách'], ['Ban công', 'View vườn']], chips: ['Sofa văng lớn', 'Bồn tắm đứng kính', 'Bàn làm việc WFH'] },
}
const duplex: Partial<Room> = {
  available: true, area: 38, occupants: 2, price: 6500000, estimate: 6950000, image: roomPhotos[2], furniture: ['Gác gỗ sồi tự nhiên', 'Đón nắng sáng', 'Khóa cửa vân tay'],
  card: { title: 'Duplex Gác Lửng Trần Cao Thoáng', specs: [['Diện tích', '38 m²'], ['Trần cao', '3,8 m'], ['Gác lửng', 'Ngủ riêng biệt']], chips: ['Gác gỗ sồi tự nhiên', 'Đón nắng sáng', 'Khóa cửa vân tay'] },
}
export const featuredIds = ['DD01-302', 'BD02-201', 'CG03-502']

export const buildings: Building[] = [
  {
    id: 'DD01', name: 'Rooms Láng Hạ', district: 'Đống Đa', ward: 'Láng Hạ', facade: 'Lam xanh, cổng vòm', style: 'fins', cols: 3, floors: 5,
    areaTitle: 'Cụm Tòa Láng Hạ - Huỳnh Thúc Kháng', image: IMG + '06-lang-ha-neighborhood.png',
    description: 'Trục trung tâm kết nối Giảng Võ - Ba Đình và Cầu Giấy. Gần trạm Metro Cát Linh - Hà Đông, xung quanh tập trung chuỗi cafe và rạp chiếu phim Quốc Gia.',
    rooms: sampleRooms('DD01', 3, 5, { 'DD01-302': studio }),
  },
  {
    id: 'BD02', name: 'Rooms Đội Cấn', district: 'Ba Đình', ward: 'Đội Cấn', facade: 'Lam gỗ, sảnh ốp đá', style: 'wood', cols: 2, floors: 5,
    areaTitle: 'Boutique Suite Đội Cấn - Liễu Giai', image: IMG + '07-ba-dinh-neighborhood.png',
    description: 'Khu dân trí cao, an ninh nghiêm ngặt, chỉ 7 phút tới hồ Ngọc Khánh và đại sứ quán Nhật Bản. Tòa nhà trang bị sảnh đón tiếp phong cách trà đạo trang nhã.',
    rooms: sampleRooms('BD02', 2, 5, { 'BD02-201': oneBedroom }),
  },
  {
    id: 'CG03', name: 'Rooms Duy Tân', district: 'Cầu Giấy', ward: 'Dịch Vọng Hậu', facade: 'Trụ gạch trần, sân thượng cây xanh', style: 'brick', cols: 3, floors: 5,
    areaTitle: 'Căn Hộ Studio Duy Tân - Cầu Giấy', image: IMG + '08-cau-giay-neighborhood.png',
    description: 'Trái tim khu thung lũng công nghệ thông tin Cầu Giấy, cực kỳ thuận tiện cho kỹ sư và chuyên viên văn phòng. Hầm để xe có trạm sạc xe máy điện thông minh.',
    rooms: sampleRooms('CG03', 3, 5, { 'CG03-502': duplex }),
  },
]
export const districtOrder = ['Đống Đa', 'Cầu Giấy', 'Ba Đình']
export const allRooms = new Map(buildings.flatMap(building => building.rooms.map(room => [room.id, { room, building }] as const)))
export const freeCount = (building: Building) => building.rooms.filter(room => room.available).length
