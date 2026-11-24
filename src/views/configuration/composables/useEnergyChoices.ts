/** 能耗统计面板共用（照搬福永配置中心参考包）：楼栋下拉选项 + 累加/扣减系数选项 */
import { computed, onMounted } from 'vue'
import { getBuildings } from '../../../api/configuration/configuration'
import { useConfigList } from './useConfiguration'

export const coefficientOptions = [
  { label: '累加', value: 1 },
  { label: '扣减', value: -1 },
]

export function useEnergyChoices() {
  const buildings = useConfigList(getBuildings)
  const buildingOptions = computed(() =>
    buildings.rows.value.map((row) => ({ label: row.buildingName, value: row.id })),
  )

  onMounted(buildings.reload)
  return { buildings, buildingOptions }
}
