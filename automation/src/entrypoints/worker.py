import asyncio

import mistralai.workflows as workflows

from workflows.daymark_cycle import DaymarkMaintenanceCycle


async def main() -> None:
    await workflows.run_worker([DaymarkMaintenanceCycle])


if __name__ == "__main__":
    asyncio.run(main())
